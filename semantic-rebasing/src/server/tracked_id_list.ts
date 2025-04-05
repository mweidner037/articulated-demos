import { ElementId, IdList } from "articulated";
import { deleteRange } from "../common/id_list_helpers";
import { IdListUpdate } from "../common/server_messages";

/**
 * Mutable wrapper around an IdList that tracks changes.
 */
export class TrackedIdList {
  private _idList: IdList;
  private updates: IdListUpdate[] = [];

  constructor(idList: IdList) {
    this._idList = idList;
  }

  get idList(): IdList {
    return this._idList;
  }

  getAndResetUpdates(): IdListUpdate[] {
    const ans = this.updates;
    this.updates = [];
    return ans;
  }

  insertAfter(before: ElementId | null, newId: ElementId, count = 1) {
    this._idList = this._idList.insertAfter(before, newId, count);
    this.updates.push({
      type: "insertAfter",
      before,
      id: newId,
      count,
    });
  }

  deleteRange(startId: ElementId, endId?: ElementId) {
    this._idList = deleteRange(this._idList, startId, endId);
    this.updates.push({ type: "deleteRange", startId, endId });
  }
}
