import { ElementId } from "articulated";
import { Slice } from "prosemirror-model";
import { Transaction } from "prosemirror-state";
import { schema } from "./prosemirror";
import { TrackedIdList } from "./tracked_id_list";

export type ClientMutation<T = any> = {
  name: string;
  /** JSON serializable. */
  args: T;
  clientCounter: number;
};

export type ClientMutationHandler<T> = {
  name: string;
  /**
   * Apply the mutation to the local state, which may be on the initiating client
   * or on the server.
   *
   * Set the selection to what it should be if the user just performed this action,
   * in case we are applying the mutation locally for the first time.
   */
  apply(tr: Transaction, trackedIds: TrackedIdList, args: T): void;
};

export const InsertHandler: ClientMutationHandler<{
  /**
   * Non-null because we never insert at the beginning of the doc - at most
   * just after the doc node's start position.
   */
  before: ElementId;
  id: ElementId;
  contentJson: unknown;
}> = {
  name: "insert",
  apply(tr, trackedIds, { before, id, contentJson }) {
    const slice = Slice.fromJSON(schema, contentJson);
    trackedIds.insertAfter(before, id, slice.size);
    const index = trackedIds.idList.indexOf(id);
    tr.replace(index, index, slice);
  },
};

/**
 * Inserts text in the context of an existing word, skipping if that word
 * has been deleted.
 */
export const InsertInWordHandler: ClientMutationHandler<{
  before: ElementId;
  id: ElementId;
  content: string;
}> = {
  name: "insertInWord",
  apply(tr, trackedIds, { before, id, content }) {
    if (!trackedIds.idList.has(before)) return;

    trackedIds.insertAfter(before, id, content.length);
    const index = trackedIds.idList.indexOf(id);
    tr.insertText(content, index);
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
  apply(tr, trackedIds, { startId, endId, contentLength }) {
    const startIndex = trackedIds.idList.indexOf(startId, "right");
    const endIndex =
      endId === undefined
        ? startIndex
        : trackedIds.idList.indexOf(endId, "left");
    if (endIndex < startIndex) {
      // Nothing left to delete.
      return;
    }

    const curLength = endIndex - startIndex + 1;
    if (contentLength !== undefined && curLength > contentLength + 10) {
      // More than ~1 word has been added to the range. Skip deleting it.
      return;
    }

    trackedIds.deleteRange(startIndex, endIndex);
    tr.delete(startIndex, endIndex + 1);
  },
};

export const allHandlers: ClientMutationHandler<any>[] = [
  InsertHandler,
  InsertInWordHandler,
  DeleteHandler,
];
