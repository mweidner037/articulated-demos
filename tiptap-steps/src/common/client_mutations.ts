import { Slice } from "@tiptap/pm/model";
import { Transaction } from "@tiptap/pm/state";
import { ElementId } from "articulated";
import { TIPTAP_SCHEMA } from "../common/tiptap";
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

// Although this derives from the same step (ReplaceStep) as ReplaceHandler,
// we need a special case for the pure-insert case, since insert-after is
// semantically different than inserting in place of a deleted range.
export const InsertHandler: ClientMutationHandler<{
  /**
   * null if at the beginning of the document.
   */
  beforeId: ElementId | null;
  newId: ElementId;
  sliceJson: unknown;
}> = {
  name: "insert",
  apply(tr, trackedIds, { beforeId, newId, sliceJson }) {
    const slice = Slice.fromJSON(TIPTAP_SCHEMA, sliceJson);
    trackedIds.insertAfter(beforeId, newId, slice.size);
    const index = trackedIds.idList.indexOf(newId);
    tr.replace(index, index, slice);
  },
};

/**
 * Delete or delete-and-insert.
 */
export const ReplaceHandler: ClientMutationHandler<{
  /** Deletion range is inclusive. */
  fromId: ElementId;
  /** Omitted if == from (single char deletion). */
  toId?: ElementId;
  /** Present if we're also inserting. */
  insert?: {
    newId: ElementId;
    sliceJson: unknown;
  };
}> = {
  name: "replace",
  apply(tr, trackedIds, { fromId, toId, insert }) {
    const from = trackedIds.idList.indexOf(fromId, "right");
    const to =
      toId === undefined ? from : trackedIds.idList.indexOf(toId, "left");

    const slice =
      insert === undefined
        ? undefined
        : Slice.fromJSON(TIPTAP_SCHEMA, insert.sliceJson);

    if (from <= to) {
      tr.replace(from, to + 1, slice);
      trackedIds.deleteRange(from, to);
      if (insert) {
        // We an insert id anywhere within the range's exclusive boundary;
        // different choices only affect our sort order relative to chars that are
        // inserted-after one of the deleted ids.
        // Let's put id just before the range.
        trackedIds.insertBefore(fromId, insert.newId, slice!.size);
      }
    } else {
      // This happens if the whole range was already deleted (due to the left/right bias).
      if (insert) {
        tr.replace(from, from, slice);
        trackedIds.insertBefore(fromId, insert.newId, slice!.size);
      }
    }
  },
};

export const allHandlers: ClientMutationHandler<any>[] = [
  InsertHandler,
  ReplaceHandler,
];
