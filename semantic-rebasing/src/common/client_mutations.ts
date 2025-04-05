import { ElementId, IdList } from "articulated";
import { EditorState } from "prosemirror-state";

export type ClientMutation<T = any> = {
  name: string;
  args: T;
};

export type ClientMutationHandler<T> = {
  name: string;
  /**
   * Apply the mutation to the local state, which may be on the initiating client
   * or on the server.
   *
   * Update the selection as if this was the user's own edit, in case its on the client.
   * TODO: Selection handling when you're just rebasing (don't want to clobber the current selection).
   */
  apply(
    idList: IdList,
    state: EditorState,
    args: T
  ): [newIdList: IdList, newState: EditorState];
};

export const InsertHandler: ClientMutationHandler<{
  /**
   * Non-null because we never insert at the beginning of the doc - at most
   * just after the doc node's start position.
   */
  before: ElementId;
  id: ElementId;
  content: string;
  /**
   * True when before is a char in the same word. In that case,
   * the insert will only succeed if before is still present.
   */
  isInWord: boolean;
}> = {
  name: "insert",
  apply(idList, state, { before, id, content, isInWord }) {
    if (isInWord && !idList.has(before)) return [idList, state];

    idList = idList.insertAfter(before, id, content.length);
    const index = idList.indexOf(id);

    const tr = state.tr;
    // insertText updates the selection for us.
    tr.insertText(content, index);
    state = state.apply(tr);

    return [idList, state];
  },
};

export const DeleteHandler: ClientMutationHandler<{
  startId: ElementId;
  endId?: ElementId;
  /**
   * The original length of the deleted content. For range deletes, used to decide
   * if we should skip this delete because too much new content has since been added.
   */
  contentLength?: number;
}> = {
  name: "delete",
  apply(idList, state, { startId, endId, contentLength }) {
    const startIndex = idList.indexOf(startId, "right");
    const endIndex =
      endId === undefined ? startIndex : idList.indexOf(endId, "left");
    const curLength = endIndex - startIndex + 1;

    if (contentLength !== undefined && curLength > contentLength + 10) {
      // More than ~1 word has been added to the range. Skip deleting it.
      return [idList, state];
    }

    const allIds: ElementId[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      allIds.push(idList.at(i));
    }
    for (const id of allIds) idList = idList.delete(id);

    const tr = state.tr;
    // delete updates the selection for us. (TODO: check)
    tr.delete(startIndex, endIndex);
    state = state.apply(tr);

    return [idList, state];
  },
};

export const allHandlers: ClientMutationHandler<any>[] = [
  InsertHandler,
  DeleteHandler,
];
