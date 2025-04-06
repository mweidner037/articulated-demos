import { IdList } from "articulated";
import "prosemirror-menu/style/menu.css";
import { Node } from "prosemirror-model";
import { EditorState, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import { ClientMutation } from "../common/client_mutations";
import { schema } from "../common/prosemirror";
import {
  ServerHelloMessage,
  ServerMutationMessage,
} from "../common/server_messages";
import { TrackedIdList } from "../common/tracked_id_list";

const DEBUG = false;

export class ProseMirrorWrapper {
  readonly view: EditorView;

  private clientCounter = 0;

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
    this.serverState = EditorState.create({
      schema,
      doc: Node.fromJSON(schema, helloMessage.docJson),
    });
    this.serverIdList = IdList.load(helloMessage.idListJson);

    this.view = new EditorView(document.querySelector("#editor"), {
      state: EditorState.create({
        schema,
      }),
      dispatchTransaction: (tr) => this.dispatchTransaction(tr),
    });
    this.trackedIds = new TrackedIdList(this.serverIdList, false);
  }

  private dispatchTransaction(tr: Transaction): void {
    this.view.updateState(this.view.state.apply(tr));

    if (tr.steps.length === 0) return;

    this.onLocalMutation(mutation);
  }

  receive(mutation: ServerMutationMessage): void {
    const tr = this.view.state.tr;

    // // Optimization: If the first mutations are confirming our first pending local mutations,
    // // just mark those as not-pending.
    // const matches = (() => {
    //   let i = 0;
    //   for (
    //     ;
    //     i < Math.min(mutations.length, this.pendingMutations.length);
    //     i++
    //   ) {
    //     if (!idEquals(mutations[i], this.pendingMutations[i].mutation)) break;
    //   }
    //   return i;
    // })();
    // mutations = mutations.slice(matches);
    // this.pendingMutations = this.pendingMutations.slice(matches);

    // // Process remaining mutations normally.

    // if (mutations.length === 0) return;

    // // For remaining mutations, we need to undo pending - do mutations - redo pending.
    // for (let p = this.pendingMutations.length - 1; p >= 0; p--) {
    //   this.pendingMutations[p].undo(tr);
    // }

    // for (let i = 0; i < mutations.length; i++) {
    //   this.applyMutation(mutations[i], tr);
    //   // If it's one of ours (possibly interleaved with remote messages),
    //   // remove it from this.pendingMessages.
    //   // As a consequence, it won't be redone.
    //   if (
    //     this.pendingMutations.length !== 0 &&
    //     idEquals(mutations[i], this.pendingMutations[0].mutation)
    //   ) {
    //     this.pendingMutations.shift();
    //   }
    //   // TODO: If the server could deliberately skip (or modify) messages, we need
    //   // to get an ack from the server and make use of it.
    // }

    // for (let p = 0; p < this.pendingMutations.length; p++) {
    //   // Apply the CRDT-ified version of the pending mutation, since it's being
    //   // rebased on top of a different state from where it was originally applied.
    //   this.pendingMutations[p].undo = this.applyMutation(
    //     this.pendingMutations[p].mutation,
    //     tr
    //   );
    // }

    tr.setMeta("addToHistory", false);
    this.view.updateState(this.view.state.apply(tr));
  }
}
