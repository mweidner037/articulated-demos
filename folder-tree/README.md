# Folder Tree

A real-time collaborative folder tree demo using [Articulated](https://github.com/mweidner037/articulated).

## Architecture

1. Clients send mutations to the server operations (e.g., "move File X to Folder A", "rename Folder B to 'C'")
2. Server applies mutations in the order it receives them, establishing a global operation order
3. Server broadcasts the mutations to all connected clients
4. Clients rebase their pending local operations on top of the server state

The `articulated` library is used to maintain stable identifiers for tree nodes: each node is assigned an `ElementId`. This allows operations to reference nodes by their stable IDs rather than by their position in the tree, which may change as other operations are applied.

### Conflict Resolution

The demo uses **Last Write Wins** semantics for conflicts:

- **Concurrent moves**: If two clients move the same node to different parents while offline, the last operation to reach the server wins
- **Move to deleted parent**: If a client tries to move a node to a parent that has been deleted, the operation is skipped
- **Cycle prevention**: If a move would create a cycle (e.g., moving A to B while B is being moved to A), the second operation is rejected

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
