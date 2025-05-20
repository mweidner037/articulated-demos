import { Mark, Schema, Slice } from "@tiptap/pm/model";
import { Transaction } from "@tiptap/pm/state";
import { Step } from "@tiptap/pm/transform";
import { ElementId } from "articulated";
import { TrackedIdList } from "./tracked_id_list";

export type ClientMutation<T = any> = {
  name: string;
  /** JSON serializable. */
  args: T;
  clientCounter: number;
};

// TODO: Change all to use tr.step? For max tiptap-step-ness.

export type ClientMutationHandler<T> = {
  name: string;
  /**
   * Apply the mutation to the local state, which may be on the initiating client
   * or on the server.
   *
   * Set the selection to what it should be if the user just performed this action,
   * in case we are applying the mutation locally for the first time.
   */
  apply(
    tr: Transaction,
    trackedIds: TrackedIdList,
    args: T,
    schema: Schema
  ): void;
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
  apply(tr, trackedIds, { beforeId, newId, sliceJson }, schema) {
    const slice = Slice.fromJSON(schema, sliceJson);
    trackedIds.insertAfter(beforeId, newId, slice.size);
    const index = trackedIds.idList.indexOf(newId);
    // TODO: Use direct steps instead of interpreting, for max chance of compat + tiptap-steps spirit.
    // TODO: account for no-op/doesn't-fit case (don't change idList).
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
  apply(tr, trackedIds, { fromId, toId, insert }, schema) {
    const from = trackedIds.idList.indexOf(fromId, "right");
    const to =
      toId === undefined ? from : trackedIds.idList.indexOf(toId, "left");

    const slice =
      insert === undefined
        ? undefined
        : Slice.fromJSON(schema, insert.sliceJson);

    if (from <= to) {
      // TODO: Use replaceRange instead? Adds some rebasing niceness.
      // Need to ensure trackedIds updates likewise (deletes same range).
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

export const ChangeMarkHandler: ClientMutationHandler<{
  fromId: ElementId;
  /** If the mark is inclusive, this is the exclusive end of the range, else the inclusive end. */
  toId: ElementId | null;
  markJson: unknown;
  isAdd: boolean;
}> = {
  name: "changeMark",
  apply(tr, trackedIds, { fromId, toId, markJson, isAdd }, schema) {
    const mark = Mark.fromJSON(schema, markJson);
    const inclusive = mark.type.spec.inclusive ?? true;
    const from = trackedIds.idList.indexOf(fromId, "right");
    const to = inclusive
      ? toId === null
        ? tr.doc.nodeSize
        : trackedIds.idList.indexOf(toId, "right")
      : trackedIds.idList.indexOf(toId!, "left") + 1;
    // TODO: Expand to beginning of paragraph if inclusive. (semantic rebasing version?)
    if (from < to) {
      if (isAdd) tr.addMark(from, to, mark);
      else tr.removeMark(from, to, mark);
    }
  },
};

export const ChangeNodeMarkHandler: ClientMutationHandler<{
  id: ElementId;
  markJson: unknown;
  isAdd: boolean;
}> = {
  name: "changeNodeMark",
  apply(tr, trackedIds, { id, markJson, isAdd }, schema) {
    // TODO: articulated: clarify default is none; upgrade both demos to use 1.0.1.
    const pos = trackedIds.idList.indexOf(id);
    if (pos === -1) return;
    // None of our mutations change the node at an ElementId, so pos should contain
    // "the same" node that was targeted originally.
    const mark = Mark.fromJSON(schema, markJson);
    if (isAdd) tr.addNodeMark(pos, mark);
    else tr.removeNodeMark(pos, mark);
  },
};

export const NodeAttrHandler: ClientMutationHandler<{
  id: ElementId;
  attr: string;
  value: unknown;
}> = {
  name: "nodeAttr",
  apply(tr, trackedIds, { id, attr, value }, schema) {
    const pos = trackedIds.idList.indexOf(id);
    if (pos === -1) return;
    // None of our mutations change the node at an ElementId, so pos should contain
    // "the same" node that was targeted originally.
    tr.setNodeAttribute(pos, attr, value);
  },
};

export const DocAttrHandler: ClientMutationHandler<{ stepJson: unknown }> = {
  name: "docAttr",
  apply(tr, _trackedIds, { stepJson }, schema) {
    const step = Step.fromJSON(schema, stepJson);
    tr.step(step);
  },
};

export const allHandlers: ClientMutationHandler<any>[] = [
  InsertHandler,
  ReplaceHandler,
  ChangeMarkHandler,
  ChangeNodeMarkHandler,
  NodeAttrHandler,
  DocAttrHandler,
];
