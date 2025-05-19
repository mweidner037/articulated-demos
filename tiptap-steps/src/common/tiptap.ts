import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

export const TIPTAP_EXTENSIONS = [StarterKit];
export const TIPTAP_SCHEMA = getSchema(TIPTAP_EXTENSIONS);
