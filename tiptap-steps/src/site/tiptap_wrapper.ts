import { Editor, EditorEvents } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import {
  AllSelection,
  EditorState,
  Selection,
  TextSelection,
} from "@tiptap/pm/state";
import {
  AddMarkStep,
  AddNodeMarkStep,
  AttrStep,
  DocAttrStep,
  RemoveMarkStep,
  RemoveNodeMarkStep,
  ReplaceStep,
  Step,
} from "@tiptap/pm/transform";
import { ElementId, IdList } from "articulated";
import { assert } from "chai";
import {
  allHandlers,
  ChangeMarkHandler,
  ChangeNodeMarkHandler,
  ClientMutation,
  ClientMutationHandler,
  DocAttrHandler,
  InsertHandler,
  NodeAttrHandler,
  ReplaceHandler,
} from "../common/client_mutations";
import { DEBUG } from "../common/debug";
import {
  ServerHelloMessage,
  ServerMutationMessage,
} from "../common/server_messages";
import { TIPTAP_EXTENSIONS } from "../common/tiptap";
import { TrackedIdList } from "../common/tracked_id_list";

const META_KEY = "TiptapWrapper";

export class ProseMirrorWrapper {
  readonly editor: Editor;

  private nextClientCounter = 1;

  private nextBunchIdCounter = 0;

  /**
   * The last known state of this.editor.view.
   * We store this so we can reference the pre-tr state in onTransaction.
   */
  private clientState: EditorState;
  /**
   * The last state received from the server.
   */
  private serverState: EditorState;
  private serverIdList: IdList;

  /**
   * Our pending local mutations, which have not yet been confirmed by the server.
   */
  private pendingMutations: ClientMutation[] = [];
  /**
   * Our current IdList with the pending mutations applied. It matches this.view.state.doc.
   */
  private trackedIds: TrackedIdList;

  constructor(
    readonly clientId: string,
    readonly onLocalMutations: (mutations: ClientMutation[]) => void,
    helloMessage: ServerHelloMessage
  ) {
    this.editor = new Editor({
      element: document.querySelector("#editor")!,
      extensions: TIPTAP_EXTENSIONS,
      content: helloMessage.docJson,
      onTransaction: this.onTransaction.bind(this),
    });

    this.serverState = this.editor.view.state;
    this.serverIdList = IdList.load(helloMessage.idListJson);
    assert.strictEqual(
      this.serverState.doc.nodeSize,
      this.serverIdList.length,
      "server state length mismatch"
    );

    this.clientState = this.serverState;
    this.trackedIds = new TrackedIdList(this.serverIdList, false);
  }

  private onTransaction({
    transaction: tr,
  }: EditorEvents["transaction"]): void {
    if (tr.getMeta(META_KEY) !== undefined || tr.steps.length === 0) {
      if (DEBUG) console.log("onTransaction top case");
      // Let through and record the new clientState.
      this.clientState = this.editor.view.state;
      return;
    }

    // The tr is not ours. Convert its steps to mutations and issue them collaboratively.
    // To ensure consistency with the server, we also overwrite the editor's state with
    // the result of these mutations (in this.mutate).
    if (DEBUG) {
      console.log("onTransaction extract mutations", this.clientState.doc);
    }
    const mutations: ClientMutation[] = [];
    const currentTr = this.clientState.tr;
    const currentIds = new TrackedIdList(this.trackedIds.idList, false);
    const addMutation = <T>(handler: ClientMutationHandler<T>, args: T) => {
      handler.apply(currentTr, currentIds, args, this.clientState.schema);
      mutations.push({
        name: handler.name,
        args,
        clientCounter: this.nextClientCounter++,
      });
    };
    const getNewId = (beforeId: ElementId | null) => {
      if (beforeId !== null && beforeId.bunchId.startsWith(this.clientId)) {
        if (
          currentIds.idList.maxCounter(beforeId.bunchId) === beforeId.counter
        ) {
          return { bunchId: beforeId.bunchId, counter: beforeId.counter + 1 };
        }
      }

      const bunchId = `${this.clientId}_${this.nextBunchIdCounter++}`;
      return { bunchId, counter: 0 };
    };

    for (let i = 0; i < tr.steps.length; i++) {
      const step = tr.steps[i];
      if (DEBUG) console.log(`  step ${i + 1}/${tr.steps.length}`, step);
      if (step instanceof ReplaceStep) {
        if (step.from < step.to) {
          // Delete or delete-and-insert.
          addMutation(ReplaceHandler, {
            fromId: currentIds.idList.at(step.from),
            toId:
              step.to === step.from + 1
                ? undefined
                : currentIds.idList.at(step.to - 1),
            insert:
              step.slice.size === 0
                ? undefined
                : {
                    newId: getNewId(
                      step.from === 0 ? null : currentIds.idList.at(step.from)
                    ),
                    sliceJson: step.slice.toJSON(),
                  },
          });
        } else {
          // Insert only.
          const beforeId =
            step.from === 0 ? null : currentIds.idList.at(step.from - 1);
          addMutation(InsertHandler, {
            beforeId,
            newId: getNewId(beforeId),
            sliceJson: step.slice.toJSON(),
          });
        }
      } else if (
        step instanceof AddMarkStep ||
        step instanceof RemoveMarkStep
      ) {
        const isAdd = step instanceof AddMarkStep;
        const inclusive = step.mark.type.spec.inclusive ?? true;
        const fromId = currentIds.idList.at(step.from);
        const toId = inclusive
          ? step.to === currentTr.doc.nodeSize - 1
            ? null
            : currentIds.idList.at(step.to + 1)
          : currentIds.idList.at(step.to);
        addMutation(ChangeMarkHandler, {
          fromId,
          toId,
          markJson: step.mark.toJSON(),
          isAdd,
        });
      } else if (
        step instanceof AddNodeMarkStep ||
        step instanceof RemoveNodeMarkStep
      ) {
        const isAdd = step instanceof AddNodeMarkStep;
        const id = currentIds.idList.at(step.pos);
        addMutation(ChangeNodeMarkHandler, {
          id,
          markJson: step.mark.toJSON(),
          isAdd,
        });
      } else if (step instanceof AttrStep) {
        const id = currentIds.idList.at(step.pos);
        addMutation(NodeAttrHandler, {
          id,
          attr: step.attr,
          value: step.value,
        });
      } else if (step instanceof DocAttrStep) {
        addMutation(DocAttrHandler, { stepJson: step.toJSON() });
      } else {
        console.error("Unsupported step:", step);
        // We don't know what to do; future step positions and the selection will get messed up.
        // Leave the doc unchanged (locally & on the server).
        this.editor.view.updateState(this.clientState);
        return;
      }

      if (DEBUG) {
        console.log("  mutation:", mutations.at(-1));
      }
    }

    // Process mutations.
    currentTr.setMeta(META_KEY, true);
    if (DEBUG) {
      console.log("Preserving selection", tr.selection.toJSON(), currentTr.doc);
      console.log(currentTr);
    }
    currentTr.setSelection(
      Selection.fromJSON(currentTr.doc, tr.selection.toJSON())
    );
    this.trackedIds = currentIds;
    // Note: updateState doesn't call onTransaction, hence why we update clientState.
    this.clientState = this.clientState.apply(currentTr);
    console.log("new clientState", this.clientState.doc.toJSON());
    this.editor.view.updateState(this.clientState);
    console.log("editor", this.editor.view.state.doc.toJSON());
    // Store for rebasing and send to server.
    this.pendingMutations.push(...mutations);
    this.onLocalMutations(mutations);
  }

  // /**
  //  * Performs a local mutation. This is what you should call in response to user
  //  * input, instead of updating the Prosemirror state directly.
  //  */
  // private mutate<T>(mutations: ClientMutation[]): void {
  //   // Perform locally.
  //   const tr = this.clientState.tr;
  //   tr.setMeta(META_KEY, true);
  //   for (let i = 0; i < mutations.length; i++) {
  //     const mutation = mutations[i];
  //     if (DEBUG) {
  //       console.log(`mutate ${i + 1}/${mutations.length}`, mutation);
  //       console.log(tr.doc);
  //     }
  //     const handler = allHandlers.find(
  //       (handler) => handler.name === mutation.name
  //     )!;
  //     handler.apply(tr, this.trackedIds, mutation.args);
  //   }
  //   if (DEBUG) console.log(tr.doc);

  //   // Store and send to server.
  //   this.pendingMutations.push(...mutations);
  //   this.onLocalMutations(mutations);
  // }

  // TODO: Batching - only need to do this once every 100ms or so (less if it's taking too long).
  receive(mutation: ServerMutationMessage): void {
    // We use Server Reconciliation: https://mattweidner.com/2024/06/04/server-architectures.html#1-server-reconciliation

    if (DEBUG) console.log("Receive mutation", this.serverState.doc);

    // Store the user's selection in terms of ElementIds.
    const idSel = selectionToIds(
      this.editor.view.state,
      this.trackedIds.idList
    );

    // Apply the mutation to our copy of the server's state.
    const serverTr = this.serverState.tr;
    serverTr.setMeta(META_KEY, true);
    for (const stepJson of mutation.stepsJson) {
      const step = Step.fromJSON(this.serverState.schema, stepJson);
      if (DEBUG) console.log("  step:", step);
      serverTr.step(step);
    }
    this.serverState = this.serverState.apply(serverTr);
    if (DEBUG) console.log("  new server state:", this.serverState.doc);

    const serverTrackedIds = new TrackedIdList(this.serverIdList, false);
    for (const update of mutation.idListUpdates) {
      serverTrackedIds.apply(update);
    }
    this.serverIdList = serverTrackedIds.idList;

    // Remove confirmed local mutations.
    if (mutation.senderId === this.clientId) {
      const lastConfirmedIndex = this.pendingMutations.findIndex(
        (pending) => pending.clientCounter === mutation.senderCounter
      );
      if (lastConfirmedIndex !== -1) {
        this.pendingMutations = this.pendingMutations.slice(
          lastConfirmedIndex + 1
        );
      }
    }

    // Re-apply pending local mutations to the new server state.
    // TODO (here and on server): account for possibility that PM doesn't like the rebased step.
    const tr = this.serverState.tr;
    this.trackedIds = new TrackedIdList(this.serverIdList, false);
    for (const pending of this.pendingMutations) {
      const handler = allHandlers.find(
        (handler) => handler.name === pending.name
      )!;
      handler.apply(tr, this.trackedIds, pending.args, this.serverState.schema);
    }

    // Restore selection.
    tr.setSelection(selectionFromIds(idSel, tr.doc, this.trackedIds.idList));

    tr.setMeta(META_KEY, true);
    tr.setMeta("addToHistory", false);
    this.editor.view.updateState(this.serverState.apply(tr));
  }
}

type IdSelection =
  | {
      type: "all";
    }
  | { type: "cursor"; id: ElementId }
  | { type: "textRange"; start: ElementId; end: ElementId; forwards: boolean }
  | { type: "unsupported" };

function selectionToIds(state: EditorState, idList: IdList): IdSelection {
  if (state.selection instanceof AllSelection) {
    return { type: "all" };
  } else if (state.selection.to === state.selection.from) {
    return { type: "cursor", id: idList.at(state.selection.from) };
  } else if (state.selection instanceof TextSelection) {
    const { from, to, anchor, head } = state.selection;
    return {
      type: "textRange",
      start: idList.at(from),
      end: idList.at(to - 1),
      forwards: head > anchor,
    };
  } else {
    console.error("Unsupported selection:", state.selection);
    return { type: "unsupported" };
  }
}

function selectionFromIds(
  idSel: IdSelection,
  doc: Node,
  idList: IdList
): Selection {
  switch (idSel.type) {
    case "all":
      return new AllSelection(doc);
    case "cursor":
      let pos = idList.indexOf(idSel.id, "left");
      if (pos < 0) pos = 0;
      return Selection.near(doc.resolve(pos));
    case "textRange":
      const from = idList.indexOf(idSel.start, "right");
      const to = idList.indexOf(idSel.end, "left") + 1;
      if (to <= from) return Selection.near(doc.resolve(from));
      const [anchor, head] = idSel.forwards ? [from, to] : [to, from];
      return TextSelection.between(doc.resolve(anchor), doc.resolve(head));
    case "unsupported":
      // Set cursor to the first char.
      return Selection.atStart(doc);
  }
}
