import type { ElementId } from "articulated";
import type { TreeStateData } from "./tree_state";

export interface TreeNode {
  id: ElementId;
  name: string;
  type: "file" | "folder";
  parentId: ElementId | null; // null = root
}

export type TreeMutation =
  | {
      type: "createNode";
      id: ElementId;
      name: string;
      nodeType: "file" | "folder";
      parentId: ElementId | null;
      afterSiblingId: ElementId | null;
    }
  | {
      type: "deleteNode";
      id: ElementId;
    }
  | {
      type: "renameNode";
      id: ElementId;
      newName: string;
    }
  | {
      type: "moveNode";
      id: ElementId;
      newParentId: ElementId | null;
    };

export interface ClientMutation {
  mutation: TreeMutation;
  clientCounter: number;
}
export interface ClientMutationMessage {
  type: "mutation";
  clientId: string;
  mutations: ClientMutation[];
}
export type ClientMessage = ClientMutationMessage;

export interface ServerHelloMessage {
  type: "hello";
  state: TreeStateData;
}
export interface ServerMutationMessage {
  type: "mutation";
  mutations: TreeMutation[];
  senderId: string;
  senderCounter: number;
}
export type ServerMessage = ServerHelloMessage | ServerMutationMessage;
