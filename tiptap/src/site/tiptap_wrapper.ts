import { Editor } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { EditorState, Transaction } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { ElementId, IdList } from "articulated";
import {
  allHandlers,
  ClientMutation,
  ClientMutationHandler,
  DeleteHandler,
  InsertHandler,
  InsertInWordHandler,
} from "../common/client_mutations";
import {
  ServerHelloMessage,
  ServerMutationMessage,
} from "../common/server_messages";
import { TrackedIdList } from "../common/tracked_id_list";

const DEBUG = true;
const META_KEY = "ProsemirrorWrapper";

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
    readonly onLocalMutation: (mutation: ClientMutation) => void,
    helloMessage: ServerHelloMessage
  ) {
    this.editor = new Editor({
      element: document.querySelector("#editor")!,
      extensions: [StarterKit],
      content: helloMessage.docJson,
      editorProps: {
        dispatchTransaction: (tr) => this.dispatchTransaction(tr),
      },
    });

    this.serverState = this.editor.view.state;
    this.serverIdList = IdList.load(helloMessage.idListJson);

    this.clientState = this.serverState;
    this.trackedIds = new TrackedIdList(this.serverIdList, false);
  }

  private dispatchTransaction(tr: Transaction): void {
    if (tr.getMeta(META_KEY) !== undefined || tr.steps.length === 0) {
      this.view.updateState(this.view.state.apply(tr));
      return;
    }

    // The tr has steps but was not issued by us. It's a user input that we need
    // to reverse engineer and convert to a mutation.
    for (let i = 0; i < tr.steps.length; i++) {
      const step = tr.steps[i];
      if (DEBUG) console.log(`dispatch ${i + 1}/${tr.steps.length}`, step);
      if (step instanceof ReplaceStep) {
        // Delete part
        if (step.from < step.to) {
          const startId = this.trackedIds.idList.at(step.from);
          if (step.to === step.from + 1) {
            // TODO: Need to apply to a state relative to the tr, so we can figure out what future steps are doing?
            // What if our change is different from the step's, so that future steps need rebasing?
            this.mutate(DeleteHandler, { startId });
          } else {
            this.mutate(DeleteHandler, {
              startId,
              endId: this.trackedIds.idList.at(step.to - 1),
              contentLength: step.to - step.from + 1,
            });
          }
        }
        // Insert part
        if (step.slice.size > 0) {
          const before = this.trackedIds.idList.at(step.from - 1);
          const newId = this.newId(before, this.trackedIds.idList);

          // Set isInWord if the first inserted char and the preceding char are both letters.
          if (
            step.slice.content.childCount === 1 &&
            step.slice.content.firstChild!.isText
          ) {
            const content = step.slice.content.firstChild!.text!;
            if (/[a-zA-z]/.test(content[0]) && step.from > 0) {
              const beforeChar = tr.docs[i].textBetween(
                step.from - 1,
                step.from
              );
              if (beforeChar.length > 0 && /[a-zA-z]/.test(beforeChar[0])) {
                this.mutate(InsertInWordHandler, {
                  before,
                  id: newId,
                  content,
                });
                continue;
              }
            }
          }

          this.mutate(InsertHandler, {
            before,
            id: newId,
            contentJson: step.slice.toJSON(),
          });
        }
      } else {
        console.error("Unsupported step:", step);
        // Skip future steps because their positions may be messed up.
        break;
      }
    }
  }

  private newId(before: ElementId | null, idList: IdList): ElementId {
    if (before !== null && before.bunchId.startsWith(this.clientId)) {
      if (idList.maxCounter(before.bunchId) === before.counter) {
        return { bunchId: before.bunchId, counter: before.counter + 1 };
      }
    }

    const bunchId = `${this.clientId}_${this.nextBunchIdCounter++}`;
    return { bunchId, counter: 0 };
  }

  /**
   * Performs a local mutation. This is what you should call in response to user
   * input, instead of updating the Prosemirror state directly.
   */
  mutate<T>(handler: ClientMutationHandler<T>, args: T): void {
    const clientCounter = this.nextClientCounter;
    const mutation: ClientMutation = {
      name: handler.name,
      args,
      clientCounter,
    };

    // Perform locally.
    if (DEBUG) {
      console.log("mutate", handler.name, args);
      console.log("  before", this.view.state.doc);
    }
    const tr = this.view.state.tr;
    handler.apply(tr, this.trackedIds, args);
    tr.setMeta(META_KEY, true);
    this.view.updateState(this.view.state.apply(tr));
    if (DEBUG) console.log("  after", this.view.state.doc);

    // Store and send to server.
    this.nextClientCounter++;
    this.pendingMutations.push(mutation);
    this.onLocalMutation(mutation);
  }

  // TODO: Batching - only need to do this once every 100ms or so (less if it's taking too long).
  receive(mutation: ServerMutationMessage): void {
    // Store the user's selection in terms of ElementIds.
    const idSel = selectionToIds(this.view.state, this.trackedIds.idList);

    // Apply the mutation to our copy of the server's state.
    const serverTr = this.serverState.tr;
    serverTr.setMeta(META_KEY, true);
    for (const stepJson of mutation.stepsJson) {
      serverTr.step(Step.fromJSON(schema, stepJson));
    }
    this.serverState = this.serverState.apply(serverTr);

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
    const tr = this.serverState.tr;
    this.trackedIds = new TrackedIdList(this.serverIdList, false);
    for (const pending of this.pendingMutations) {
      const handler = allHandlers.find(
        (handler) => handler.name === pending.name
      )!;
      handler.apply(tr, this.trackedIds, pending.args);
    }

    // Restore selection.
    tr.setSelection(selectionFromIds(idSel, tr.doc, this.trackedIds.idList));

    tr.setMeta(META_KEY, true);
    tr.setMeta("addToHistory", false);
    this.view.updateState(this.serverState.apply(tr));
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
      const to = idList.indexOf(idSel.end, "left");
      if (to < from) return Selection.near(doc.resolve(from));
      const [anchor, head] = idSel.forwards ? [from, to] : [to, from];
      return TextSelection.between(doc.resolve(anchor), doc.resolve(head));
    case "unsupported":
      // Set cursor to the first char.
      return Selection.atStart(doc);
  }
}
