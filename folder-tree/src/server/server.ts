import { join } from "path";
import express from "express";
import { WebSocketServer } from "ws";

import { TreeServer } from "./tree_server";

const port = process.env.PORT || 5566;
const app = express();

app.use(express.static(join(__dirname, "../../dist")));
const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

const wss = new WebSocketServer({ server });
new TreeServer(wss);
