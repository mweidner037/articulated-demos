# Folder Tree

A real-time collaborative folder tree demo using [Articulated](https://github.com/mweidner037/articulated).

## Architecture

1. Clients send mutations to the server (e.g., "move File X to Folder A after File Y", "rename Folder B to 'C'")
2. Server applies mutations in the order it receives them, establishing a global operation order
3. Server broadcasts the mutations to all connected clients
4. Clients rebase their pending local operations on top of the server state

The `articulated` library is used to maintain stable identifiers for tree nodes: each node is assigned an `ElementId`. This allows operations to reference nodes by their stable IDs rather than by their position in the tree, which may change as other operations are applied.

### Moving and Reordering

Choose a destination folder (or Root), then choose the first position or a sibling to place the node after. The position prompt defaults to the last sibling. You can select the current parent to reorder its children.

The client API is `moveNode(id, newParentId, newAfterSiblingId)`. `newAfterSiblingId = null` places the node first; otherwise it references a visible sibling in the destination parent. The move changes both the parent and the global list position, preserving the node's ID and its descendants' relationships and order.

### Conflict Resolution

The server processes operations in the order it receives them, validating each against the current tree:

- **Concurrent moves**: If two clients move the same node, the last valid operation to reach the server determines its parent and position
- **Move to deleted parent**: If a client tries to move a node to a parent that has been deleted, the operation is skipped
- **Unavailable sibling**: If the specified sibling has been deleted, moved to another parent, or never created successfully, the entire move is skipped
- **Cycle prevention**: If a move would create a cycle (e.g., moving A to B while B is being moved to A), the second operation is rejected
- **Subtree deletion**: Deleting a folder deletes all of its descendants at the time the operation is applied, retaining their IDs as tombstones

Skipped operations are still broadcast and acknowledged, so clients remove them from their pending queues.

## Code Organization

- `src/common/`: Shared types and logic
- `src/server/`: WebSocket server
- `src/site/`: UI

## Installation

First, install [Node.js](https://nodejs.org/). Then run:

```sh
npm install
```

## Development

Start both the client build process and the server:

```sh
npm run dev
```

This will:

1. Build the client code with Vite (in development mode)
2. Start the WebSocket server on port 5566

Then open [http://localhost:5566](http://localhost:5566) in multiple browser windows to test real-time collaboration.

## Production

Build the optimized client and server code:

```sh
npm run build
```

Then start the production server:

```sh
npm run start
```

The server will run on port 5566 by default.
