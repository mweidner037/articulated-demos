import { ElementId, SavedIdList } from "articulated";

export type ServerHelloMessage = {
  type: "hello";
  docJSON: any;
  idList: SavedIdList;
  version: number;
};

export type ServerMutationMessage = {
  type: "mutation";
  stepsJSON: any[];
  idListUpdates: IdListUpdate[];
};

export type IdListUpdate =
  | {
      type: "insertAfter";
      before: ElementId | null;
      id: ElementId;
      count: number;
    }
  | {
      type: "deleteRange";
      startId: ElementId;
      endId?: ElementId;
    };

export type ServerMessage = ServerMutationMessage | ServerHelloMessage;
