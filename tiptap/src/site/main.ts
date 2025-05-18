import { v4 as uuidv4 } from "uuid";
import { ClientMessage } from "../common/client_messages";
import { ClientMutation } from "../common/client_mutations";
import { ServerMessage } from "../common/server_messages";
import { ProseMirrorWrapper } from "./tiptap_wrapper";
import { WebSocketClient } from "./web_socket_client";

const wsURL = location.origin.replace(/^http/, "ws");
const clientId = uuidv4();
const client = new WebSocketClient(wsURL);

client.onMessage = (data) => {
  const msg = JSON.parse(data) as ServerMessage;
  if (msg.type === "hello") {
    // Got the initial state. Start ProseMirror.
    const wrapper = new ProseMirrorWrapper(clientId, onLocalMutation, msg);
    client.onMessage = (data) => onMessage(data, wrapper);
  } else {
    console.error("Received non-welcome message first: " + msg.type);
  }
};

function onMessage(data: string, wrapper: ProseMirrorWrapper): void {
  const msg = JSON.parse(data) as ServerMessage;
  switch (msg.type) {
    case "mutation":
      wrapper.receive(msg);
      break;
    default:
      console.error("Unexpected message type:", msg.type, msg);
  }
}

function onLocalMutation(mutation: ClientMutation) {
  // TODO: Batching.
  send({ type: "mutation", clientId, mutations: [mutation] });
}

function send(msg: ClientMessage): void {
  client.send(JSON.stringify(msg));
}

// --- "Connected" checkbox for testing concurrency ---

const connected = document.getElementById("connected") as HTMLInputElement;
connected.addEventListener("click", () => {
  client.testConnected = !client.testConnected;
});
