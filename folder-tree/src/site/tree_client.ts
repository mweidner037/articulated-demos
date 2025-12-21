import { ElementId, ElementIdGenerator } from "articulated";
import { v4 as uuidv4 } from "uuid";

import { WebSocketClient } from "./ws_client";
import { TreeState } from "../common/tree_state";
import type {
  ClientMutation,
  TreeMutation,
  TreeNode,
  ClientMessage,
  ServerMessage,
  ServerMutationMessage,
} from "../common/types";

export class TreeClient {
  private clientId: string;
  private ws: WebSocketClient;
  private idGenerator: ElementIdGenerator;
  private nextBunchIdCounter = 0;

  private serverState: TreeState;
  private pendingMutations: ClientMutation[] = [];
  private currentState: TreeState;

  private nextClientCounter = 1;

  constructor(
    wsUrl: string,
    private onStateChange: (nodes: TreeNode[]) => void
  ) {
    this.clientId = uuidv4();
    this.idGenerator = new ElementIdGenerator(
      () => `${this.clientId}_${this.nextBunchIdCounter++}`
    );

    this.serverState = new TreeState();
    this.currentState = new TreeState();

    this.ws = new WebSocketClient(wsUrl);
    this.ws.onMessage = (message) => this.handleMessage(JSON.parse(message));
  }

  private handleMessage(message: ServerMessage) {
    if (message.type === "hello") {
      this.serverState = TreeState.load(message.state);
      this.currentState = this.serverState;
      this.onStateChange(this.currentState.getAllNodes());
    }
    if (message.type === "mutation") {
      // Server reconciliation
      this.receive(message);
    }
  }

  private receive(message: ServerMutationMessage) {
    // 1. apply mutations to server state
    let newServerState = this.serverState;
    for (const mutation of message.mutations) {
      newServerState = newServerState.apply(mutation);
    }
    this.serverState = newServerState;

    // 2. remove confirmed pending mutations
    if (message.senderId === this.clientId) {
      const confirmedIndex = this.pendingMutations.findIndex(
        ({ clientCounter }) => clientCounter === message.senderCounter
      );
      if (confirmedIndex !== -1) {
        this.pendingMutations = this.pendingMutations.slice(confirmedIndex + 1);
      }
    }

    // 3. Rebase: reapply pending mutations
    let newCurrentState = this.serverState;
    for (const pending of this.pendingMutations) {
      newCurrentState = newCurrentState.apply(pending.mutation);
    }
    this.currentState = newCurrentState;

    // 4. notify UI change
    this.onStateChange(this.currentState.getAllNodes());
  }

  /**
   * Locally mutation
   */
  private mutate(mutation: TreeMutation) {
    const clientMutation: ClientMutation = {
      mutation,
      clientCounter: this.nextClientCounter++,
    };

    // 1. apply locally immediately
    this.currentState = this.currentState.apply(mutation);
    this.onStateChange(this.currentState.getAllNodes());

    // 2. add to pending
    this.pendingMutations.push(clientMutation);

    // 3. send to server
    this.send({
      type: "mutation",
      clientId: this.clientId,
      mutations: [clientMutation],
    });
  }

  private send(message: ClientMessage) {
    this.ws.send(JSON.stringify(message));
  }

  updateTestConnection(value: boolean) {
    this.ws.testConnected = value;
  }

  createNode(
    name: string,
    type: "file" | "folder",
    parentId: ElementId | null,
    afterSiblingId: ElementId | null = null
  ) {
    const id = this.idGenerator.generateAfter(afterSiblingId);
    this.mutate({
      type: "createNode",
      id,
      name,
      nodeType: type,
      parentId,
      afterSiblingId,
    });
  }

  deleteNode(id: ElementId) {
    this.mutate({ type: "deleteNode", id });
  }

  renameNode(id: ElementId, newName: string) {
    this.mutate({ type: "renameNode", id, newName });
  }

  moveNode(id: ElementId, newParentId: ElementId | null) {
    this.mutate({ type: "moveNode", id, newParentId });
  }
}
