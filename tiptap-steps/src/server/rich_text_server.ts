import { EditorState } from "@tiptap/pm/state";
import { IdList } from "articulated";
import util from "util";
import { WebSocket, WebSocketServer } from "ws";
import { ClientMessage } from "../common/client_messages";
import { allHandlers } from "../common/client_mutations";
import { DEBUG } from "../common/debug";
import { ServerMessage } from "../common/server_messages";
import { TIPTAP_SCHEMA } from "../common/tiptap";
import { TrackedIdList } from "../common/tracked_id_list";

const heartbeatInterval = 30000;

/**
 * Server that assigns mutations a sequence number and echoes them to all
 * clients in order.
 *
 * We store the full Mutation log for welcoming future clients. In principle,
 * you could instead store just the current ProseMirror + Outline states and
 * use those to welcome clients. (For reconnections, you would also need a vector
 * clock or similar, to tell clients which of their past mutations have been acked.)
 */
export class RichTextServer {
  private state: EditorState;
  private readonly trackedIds: TrackedIdList;

  private clients = new Set<WebSocket>();

  constructor(readonly wss: WebSocketServer) {
    this.state = EditorState.create({ schema: TIPTAP_SCHEMA });
    const idList = IdList.new().insertAfter(
      null,
      { bunchId: "init", counter: 0 },
      this.state.doc.nodeSize
    );
    this.trackedIds = new TrackedIdList(idList, true);

    this.wss.on("connection", (ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        this.wsOpen(ws);
      } else ws.on("open", () => this.wsOpen(ws));
      ws.on("message", (data) => this.wsReceive(ws, data.toString()));
      ws.on("close", () => this.wsClose(ws));
      ws.on("error", (err) => {
        console.error(err);
        this.wsClose(ws);
      });
    });
  }

  /**
   * Ping to keep connection alive.
   *
   * This is necessary on at least Heroku, which has a 55 second timeout:
   * https://devcenter.heroku.com/articles/websockets#timeouts
   */
  private startHeartbeats(ws: WebSocket) {
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else clearInterval(interval);
    }, heartbeatInterval);
  }

  private wsClose(ws: WebSocket) {
    this.clients.delete(ws);
  }

  private sendMessage(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState == WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private broadcast(msg: ServerMessage) {
    const data = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState == WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  private wsOpen(ws: WebSocket) {
    this.startHeartbeats(ws);

    // Send the current state.
    this.sendMessage(ws, {
      type: "hello",
      docJson: this.state.doc.toJSON(),
      idListJson: this.trackedIds.idList.save(),
    });

    this.clients.add(ws);
  }

  private wsReceive(ws: WebSocket, data: string) {
    const msg = JSON.parse(data) as ClientMessage;
    switch (msg.type) {
      case "mutation":
        if (DEBUG) {
          console.log(
            "Apply mutations",
            util.inspect(this.state.doc.toJSON(), {
              showHidden: false,
              depth: null,
              colors: true,
            })
          );
        }
        const tr = this.state.tr;
        for (let i = 0; i < msg.mutations.length; i++) {
          const mutation = msg.mutations[i];
          const handler = allHandlers.find(
            (handler) => handler.name === mutation.name
          );
          if (handler === undefined) {
            console.error("Missing handler: " + mutation.name);
            continue;
          }
          if (DEBUG) {
            console.log(
              `mutation ${i + 1}/${msg.mutations.length}:\n`,
              mutation.name,
              util.inspect(mutation.args, {
                showHidden: false,
                depth: null,
                colors: true,
              })
            );
          }
          handler.apply(tr, this.trackedIds, mutation.args);
          if (DEBUG) {
            console.log(
              "result:\n",
              util.inspect(tr.doc.toJSON(), {
                showHidden: false,
                depth: null,
                colors: true,
              })
            );
          }
        }

        // TODO: Batch server messages by interval, not per mutation message.
        const stepsJson = tr.steps.map((step) => step.toJSON());
        if (DEBUG) {
          console.log(
            "steps:\n",
            util.inspect(stepsJson, {
              showHidden: false,
              depth: null,
              colors: true,
            })
          );
        }
        const idListUpdates = this.trackedIds.getAndResetUpdates();
        this.state = this.state.apply(tr);
        // TODO (here and on client): assert lengths match.

        this.broadcast({
          type: "mutation",
          stepsJson,
          idListUpdates,
          senderId: msg.clientId,
          senderCounter: msg.mutations.at(-1)!.clientCounter,
        });
        break;
      default:
        console.error("Unknown message type: " + msg.type);
    }
  }
}
