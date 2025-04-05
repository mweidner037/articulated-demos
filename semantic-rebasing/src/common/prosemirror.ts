import { Schema } from "prosemirror-model";

export const schema = new Schema({
  nodes: {
    doc: { content: "text*" },
    text: { inline: true },
  },
});
