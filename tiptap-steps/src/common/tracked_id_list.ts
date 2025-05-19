import { ElementId, IdList } from "articulated";

export type IdListUpdate =
  | {
      type: "insertAfter";
      before: ElementId | null;
      id: ElementId;
      count: number;
    }
  | {
      type: "insertBefore";
      after: ElementId | null;
      id: ElementId;
      count: number;
    }
  | {
      type: "deleteRange";
      startIndex: number;
      endIndex: number;
    };

/**
 * Mutable wrapper around an IdList that optionally tracks changes.
 */
export class TrackedIdList {
  private _idList: IdList;
  private updates: IdListUpdate[] = [];

  constructor(idList: IdList, readonly trackChanges: boolean) {
    this._idList = idList;
  }

  get idList(): IdList {
    return this._idList;
  }

  getAndResetUpdates(): IdListUpdate[] {
    if (!this.trackChanges) {
      throw new Error("trackChanges not set");
    }
    const ans = this.updates;
    this.updates = [];
    return ans;
  }

  insertAfter(before: ElementId | null, newId: ElementId, count = 1) {
    this._idList = this._idList.insertAfter(before, newId, count);

    if (this.trackChanges) {
      this.updates.push({
        type: "insertAfter",
        before,
        id: newId,
        count,
      });
    }
  }

  insertBefore(after: ElementId | null, newId: ElementId, count = 1) {
    this._idList = this._idList.insertBefore(after, newId, count);

    if (this.trackChanges) {
      this.updates.push({
        type: "insertBefore",
        after,
        id: newId,
        count,
      });
    }
  }

  deleteRange(startIndex: number, endIndex: number) {
    const allIds: ElementId[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      allIds.push(this._idList.at(i));
    }
    for (const id of allIds) this._idList = this._idList.delete(id);

    if (this.trackChanges) {
      this.updates.push({ type: "deleteRange", startIndex, endIndex });
    }
  }

  apply(update: IdListUpdate): void {
    switch (update.type) {
      case "insertBefore":
        this._idList = this._idList.insertAfter(
          update.after,
          update.id,
          update.count
        );
        break;
      case "insertAfter":
        this._idList = this._idList.insertAfter(
          update.before,
          update.id,
          update.count
        );
        break;
      case "deleteRange":
        const allIds: ElementId[] = [];
        for (let i = update.startIndex; i <= update.endIndex; i++) {
          allIds.push(this._idList.at(i));
        }
        for (const id of allIds) this._idList = this._idList.delete(id);
        break;
      default:
        void (update satisfies never);
    }
  }
}
