import { ElementId, equalsId, IdList, type SavedIdList } from "articulated";
import type { TreeNode, TreeMutation } from "./types";

function elementIdToString(id: ElementId) {
  return `${id.bunchId}:${id.counter}`;
}

export interface TreeStateData {
  idListJson: SavedIdList;
  nodesJson: [string, TreeNode][];
}

/**
 * Persistent tree state: apply never modifies this version. Successful updates
 * return a new state; skipped operations return this state unchanged.
 * Unchanged IdList structure and node objects are shared between versions.
 */
export class TreeState {
  // One global list determines sibling order by filtering on parentId. Nodes
  // from different parents may interleave; subtrees need not be contiguous.
  // This avoids maintaining a separate IdList for every folder.
  private idList: IdList;
  private nodes: Map<string, TreeNode>; // key = elementIdToString(id)

  constructor(
    idList: IdList = IdList.new(),
    nodes: Map<string, TreeNode> = new Map()
  ) {
    this.idList = idList;
    this.nodes = nodes;
  }

  apply(mutation: TreeMutation) {
    let newIdList = this.idList;
    const newNodes = new Map(this.nodes);

    switch (mutation.type) {
      case "createNode": {
        const { id, name, nodeType, parentId, afterSiblingId } = mutation;

        if (parentId !== null) {
          const parent = this.getNode(parentId);
          if (!parent || parent.type !== "folder") {
            console.warn("Parent not found or not a folder, skipping create");
            return this;
          }
        }

        newIdList = newIdList.insertAfter(afterSiblingId, id);
        newNodes.set(elementIdToString(id), {
          id,
          name,
          type: nodeType,
          parentId,
        });

        return new TreeState(newIdList, newNodes);
      }

      case "deleteNode": {
        const { id } = mutation;
        const node = this.getNode(id);
        if (!node) return this;

        newIdList = deleteSubtree(newIdList, newNodes, node);

        return new TreeState(newIdList, newNodes);
      }

      case "renameNode": {
        const { id, newName } = mutation;
        const node = this.getNode(id);
        if (!node) return this;

        newNodes.set(elementIdToString(id), { ...node, name: newName });
        return new TreeState(newIdList, newNodes);
      }

      case "moveNode": {
        const { id, newParentId, newAfterSiblingId } = mutation;
        const node = this.getNode(id);
        if (!node || !this.idList.has(id)) return this;

        // check new parent validity
        if (newParentId !== null) {
          const newParent = this.getNode(newParentId);
          if (!newParent || newParent.type !== "folder") {
            console.warn("New parent not found or not a folder, skipping move");
            return this;
          }

          // Prevent moving to its own descendant (which would cause a cycle)
          if (equalsId(newParentId, id) || this.isDescendant(newParentId, id)) {
            console.warn("Cannot move to descendant, skipping move");
            return this;
          }
        }

        if (newAfterSiblingId !== null) {
          const sibling = this.getNode(newAfterSiblingId);
          if (
            !sibling ||
            !this.idList.has(newAfterSiblingId) ||
            equalsId(newAfterSiblingId, id) ||
            (newParentId === null
              ? sibling.parentId !== null
              : sibling.parentId === null ||
                !equalsId(sibling.parentId, newParentId))
          ) {
            console.warn(
              "Sibling not found or not in target parent, skipping move"
            );
            return this;
          }
        }

        // Reposition the existing ID within this operation. No intermediate
        // state escapes, and future operations can still reference the same ID.
        newIdList = newIdList.uninsert(id).insertAfter(newAfterSiblingId, id);
        newNodes.set(elementIdToString(id), { ...node, parentId: newParentId });

        return new TreeState(newIdList, newNodes);
      }
    }
  }

  getNode(id: ElementId) {
    return this.nodes.get(elementIdToString(id));
  }

  getAllNodes() {
    const result: TreeNode[] = [];
    for (const id of this.idList) {
      const node = this.getNode(id);
      if (node) result.push(node);
    }
    return result;
  }

  getChildren(parentId: ElementId | null) {
    const parentKey = parentId ? elementIdToString(parentId) : null;
    return this.getAllNodes().filter(
      (node) =>
        (parentKey === null && node.parentId === null) ||
        (node.parentId && elementIdToString(node.parentId) === parentKey)
    );
  }

  private isDescendant(descendantId: ElementId, ancestorId: ElementId) {
    let current = this.getNode(descendantId);
    while (current && current.parentId) {
      if (equalsId(current.parentId, ancestorId)) return true;
      current = this.getNode(current.parentId);
    }
    return false;
  }

  save() {
    return {
      idListJson: this.idList.save(),
      nodesJson: Array.from(this.nodes.entries()),
    };
  }

  static load(data: TreeStateData) {
    const idList = IdList.load(data.idListJson);
    const nodes = new Map<string, TreeNode>(data.nodesJson);
    return new TreeState(idList, nodes);
  }
}

/** Deletes into a single Map copy, retaining the IDs as tombstones. */
function deleteSubtree(
  idList: IdList,
  nodes: Map<string, TreeNode>,
  node: TreeNode
): IdList {
  if (node.type === "folder") {
    for (const child of nodes.values()) {
      if (child.parentId !== null && equalsId(child.parentId, node.id)) {
        idList = deleteSubtree(idList, nodes, child);
      }
    }
  }
  nodes.delete(elementIdToString(node.id));
  return idList.delete(node.id);
}
