import { equalsId } from "articulated";

import { TreeClient } from "./tree_client";
import type { TreeNode } from "../common/types";

export class TreeUi {
  private container: HTMLElement;
  public client: TreeClient;

  constructor(containerId: string, wsUrl: string) {
    const containerElement = document.getElementById(containerId);
    if (!containerElement) {
      throw new Error(`Container element with id '${containerId}' not found`);
    }
    this.container = containerElement;
    this.client = new TreeClient(wsUrl, (nodes) => this.render(nodes));
  }

  private render(nodes: TreeNode[]) {
    this.container.innerHTML = "";
    const rootNodes = nodes.filter((n) => n.parentId === null);

    const ul = document.createElement("ul");
    ul.className = "tree-root";

    for (const node of rootNodes) {
      ul.appendChild(this.renderNode(node, nodes));
    }

    this.container.appendChild(ul);
  }

  private renderNode(node: TreeNode, allNodes: TreeNode[]) {
    const li = document.createElement("li");
    li.className = "tree-node";

    const nodeDiv = document.createElement("div");
    nodeDiv.className = "node-content";

    const icon = document.createElement("span");
    icon.textContent = node.type === "folder" ? "📁 " : "📄 ";
    nodeDiv.appendChild(icon);

    const nameSpan = document.createElement("span");
    nameSpan.textContent = node.name;
    nodeDiv.appendChild(nameSpan);

    const actions = document.createElement("span");
    actions.className = "actions";

    if (node.type === "folder") {
      const addFolderBtn = this.createButton("📁 +", () => {
        const name = prompt("New folder name:");
        if (name) this.client.createNode(name, "folder", node.id);
      });
      addFolderBtn.title = "New folder";
      actions.appendChild(addFolderBtn);

      const addFileBtn = this.createButton("📄 +", () => {
        const name = prompt("New file name:");
        if (name) this.client.createNode(name, "file", node.id);
      });
      addFileBtn.title = "New file";
      actions.appendChild(addFileBtn);
    }

    const renameBtn = this.createButton("✏️", () => {
      const name = prompt("New name:", node.name);
      if (name) this.client.renameNode(node.id, name);
    });
    renameBtn.title = "Rename";
    actions.appendChild(renameBtn);

    const moveBtn = this.createButton("↕️", () => {
      this.handleMove(node, allNodes);
    });
    moveBtn.title = "Move";
    actions.appendChild(moveBtn);

    const deleteBtn = this.createButton("❌", () => {
      if (confirm(`Delete ${node.name}?`)) {
        this.client.deleteNode(node.id);
      }
    });
    deleteBtn.title = "Delete";
    actions.appendChild(deleteBtn);

    nodeDiv.appendChild(actions);
    li.appendChild(nodeDiv);

    // Render children if folder
    if (node.type === "folder") {
      const children = allNodes.filter(
        ({ parentId }) => parentId && equalsId(parentId, node.id)
      );

      if (children.length > 0) {
        const childUl = document.createElement("ul");
        childUl.className = "tree-children";
        for (const child of children) {
          childUl.appendChild(this.renderNode(child, allNodes));
        }
        li.appendChild(childUl);
      }
    }

    return li;
  }

  private handleMove(node: TreeNode, allNodes: TreeNode[]) {
    const folders = allNodes.filter(({ type }) => type === "folder");

    const options = ["(Root)"];
    const folderMap = new Map<number, TreeNode | null>();
    folderMap.set(0, null); // Root

    let index = 1;
    for (const folder of folders) {
      if (
        equalsId(folder.id, node.id) ||
        this.isDescendant(folder, node, allNodes)
      ) {
        continue;
      }

      const depth = this.getDepth(folder, allNodes);
      const indent = "  ".repeat(depth);
      options.push(`${indent}📁 ${folder.name}`);
      folderMap.set(index, folder);
      index++;
    }

    const message = `Move "${node.name}" to:\n\n${options
      .map((opt, i) => `${i}. ${opt}`)
      .join("\n")}\n\nEnter number:`;
    const input = prompt(message);
    if (input === null) return;

    const selectedIndex = Number(input);
    if (
      input.trim() === "" ||
      !Number.isInteger(selectedIndex) ||
      !folderMap.has(selectedIndex)
    ) {
      alert("Invalid selection");
      return;
    }

    const targetFolder = folderMap.get(selectedIndex);
    const newParentId = targetFolder ? targetFolder.id : null;

    const siblings = allNodes.filter(
      ({ id, parentId }) =>
        !equalsId(id, node.id) &&
        (newParentId === null
          ? parentId === null
          : parentId !== null && equalsId(parentId, newParentId))
    );
    const positions = [
      "First",
      ...siblings.map((sibling) => `After "${sibling.name}"`),
    ];
    const positionInput = prompt(
      `Place "${node.name}":\n\n${positions
        .map((position, i) => `${i}. ${position}`)
        .join("\n")}\n\nEnter number:`,
      String(siblings.length)
    );
    if (positionInput === null) return;
    const positionIndex = Number(positionInput);
    if (
      positionInput.trim() === "" ||
      !Number.isInteger(positionIndex) ||
      positionIndex < 0 ||
      positionIndex >= positions.length
    ) {
      alert("Invalid selection");
      return;
    }

    this.client.moveNode(
      node.id,
      newParentId,
      positionIndex === 0 ? null : siblings[positionIndex - 1].id
    );
  }

  private isDescendant(
    folder: TreeNode,
    node: TreeNode,
    allNodes: TreeNode[]
  ): boolean {
    let current: TreeNode | undefined = folder;
    while (current && current.parentId) {
      if (equalsId(current.parentId, node.id)) {
        return true;
      }
      current = allNodes.find(({ id }) => equalsId(id, current!.parentId!));
    }
    return false;
  }

  private getDepth(node: TreeNode, allNodes: TreeNode[]): number {
    let depth = 0;
    let current: TreeNode | undefined = node;
    while (current && current.parentId) {
      depth++;
      current = allNodes.find(({ id }) => equalsId(id, current!.parentId!));
    }
    return depth;
  }

  private createButton(text: string, onClick: () => void) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.onclick = onClick;
    return btn;
  }
}
