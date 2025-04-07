# Semantic Rebasing

Simple ProseMirror/WebSocket collaboration with a server that accounts for the meaning/intent of edits when rebasing them.

This is a demo for the [articulated](https://github.com/mweidner037/articulated) collaborative text-editing library.

## Architecture

Clients send _mutations_ to the server, which describe high-level user intent (e.g., "insert the character 'u' into the word 'color' here, unless that word has been deleted"). The server applies these mutations literally to its own copy of the ProseMirror state, in the order that it receives them. It also broadcasts the resulting changes (ProseMirror [steps](https://prosemirror.net/docs/ref/#transform.Steps)) to all clients over WebSockets. Clients apply those steps to their own ProseMirror states, accommodating pending local updates using [server reconciliation](https://mattweidner.com/2024/06/04/server-architectures.html#1-server-reconciliation).

The `articulated` library is used to address characters: each character is assigned an [ElementId](https://github.com/mweidner037/articulated#elementid), which doesn't change over time, unlike a ProseMirror position (~array index), which increments/decrements as text is added/deleted earlier in the document. Mutations sent to the server then reference these ElementIds - e.g., "insert 'u' at ElementId <...> directly after ElementId <...>". The server follows such instructions literally, using `articulated` to translate between ElementIds and their current ProseMirror positions.

### Semantics

The combination of server reconciliation and `articulated` makes it possible to implement interesting semantics, in the case where the server receives a mutation from a client that intended it for a different state (i.e., the mutation needs to be [rebased](https://mattweidner.com/2024/06/04/server-architectures.html#server-side-rebasing)):

- Server reconciliation allows the mutations to make arbitrary changes without worrying about eventual consistency (unlike a CRDT or OT architecture).
- `articulated` lets the server manipulate ElementIds at will - deleting, creating, or even reordering them - so it has more flexibility than using CRDT positions, OT indices, or [list-positions](https://github.com/mweidner037/list-positions).

As an example, the demo's "insert" mutation follows the rule: if the inserted content is a character inserted directly after another character (i.e., in the middle of the word), and that word is no longer present by the time the mutation reaches the server (because it was deleted concurrently), then the insertion is skipped. Here's a screen recording:

TODO: example movie

Thus the demo avoids the "colour" anomaly described by [Alex Clemmer](https://www.moment.dev/blog/lies-i-was-told-pt-1).

<!-- A similar effect happens if the insertion reaches the server before the word's deletion: the "delete" mutation targets a range instead of individual characters ("delete from \<start\> to \<end\>"), so the deleting the whole word will also delete characters concurrently inserted in the middle. -->

## Code

Code organization:

- `src/common/`: Messages and code shared between clients and the server.
- `src/server/`: WebSocket server.
- `src/site/`: ProseMirror client.

## Installation

First, install [Node.js](https://nodejs.org/). Then run `npm i`.

## Commands

### `npm run dev`

Build the client from `src/site/`, in [development mode](https://webpack.js.org/guides/development/). You can also use `npm run watch`.

### `npm run build`

Build the client from `src/site/`, in [production mode](https://webpack.js.org/guides/production/).

### `npm start`

Run the server on [http://localhost:3000/](http://localhost:3000/). Use multiple browser windows at once to test collaboration.

To change the port, set the `$PORT` environment variable.

### `npm run clean`

Delete `dist/`.
