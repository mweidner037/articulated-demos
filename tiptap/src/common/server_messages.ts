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
  senderId: string;
  /**
   * The last mutation's clientCounter. For the sender so that they know to stop rebasing.
   */
  senderCounter: number;
};

export type ServerMessage = ServerMutationMessage | ServerHelloMessage;
