import { TreeUi } from "./ui";

const wsUrl = location.origin.replace(/^http/, "ws");
const ui = new TreeUi("tree", wsUrl);

document.getElementById("new-folder-btn")?.addEventListener("click", () => {
  const name = prompt("Folder name:");
  if (name) {
    ui.client.createNode(name, "folder", null);
  }
});

document.getElementById("new-file-btn")?.addEventListener("click", () => {
  const name = prompt("File name:");
  if (name) {
    ui.client.createNode(name, "file", null);
  }
});

const connectedCheckbox = document.getElementById(
  "connected-checkbox"
) as HTMLInputElement;
const status = document.getElementById("status-text")!;

connectedCheckbox.addEventListener("change", () => {
  const connected = connectedCheckbox.checked;
  ui.client.updateTestConnection(connected);
  if (connected) {
    status.textContent = "Connected";
  } else {
    status.textContent = "Disconnected";
  }
});

console.log("Collaborative Folder Tree initialized");
