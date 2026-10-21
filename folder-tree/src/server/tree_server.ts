import { WebSocket, type WebSocketServer } from "ws";

import { TreeState } from "../common/tree_state";
import type { ClientMessage, ServerMessage } from "../common/types";

export class TreeServer {
  private state: TreeState;
  private clients = new Set<WebSocket>();

  constructor(readonly wss: WebSocketServer) {
    this.state = new TreeState();

    this.wss.on("connection", (ws) => {
      this.wsOpen(ws);
      ws.on("message", (data) => this.wsReceive(ws, data.toString()));
      ws.on("close", () => this.clients.delete(ws));
    });
  }

  private wsOpen(ws: WebSocket) {
    this.send(ws, {
      type: "hello",
      state: this.state.save(),
    });

    this.clients.add(ws);
  }

  private wsReceive(ws: WebSocket, data: string) {
    const msg = JSON.parse(data) as ClientMessage;

    if (msg.type === "mutation") {
      for (const clientMutation of msg.mutations) {
        this.state = this.state.apply(clientMutation.mutation);
      }

      this.broadcast({
        type: "mutation",
        mutations: msg.mutations.map(({ mutation }) => mutation),
        senderId: msg.clientId,
        senderCounter: msg.mutations.at(-1)!.clientCounter,
      });
    }
  }

  private send(ws: WebSocket, message: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: ServerMessage) {
    const data = JSON.stringify(message);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }
}
