import { SavedIdList } from "articulated";
import { IdListUpdate } from "./tracked_id_list";

export type ServerHelloMessage = {
  type: "hello";
  docJson: any;
  idListJson: SavedIdList;
};

export type ServerMutationMessage = {
  type: "mutation";
  stepsJson: any[];
  idListUpdates: IdListUpdate[];
  // For the sender, so they know to stop rebasing their local copy.
  senderCounter: number;
};

export type ServerMessage = ServerMutationMessage | ServerHelloMessage;
