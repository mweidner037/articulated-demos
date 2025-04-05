import { IdList } from "articulated";
import { EditorState } from "prosemirror-state";

export type ClientMutation<T = any> = {
  name: string;
  args: T;
};

export type ClientMutationHandler<T> = {
  name: string;
  apply(
    idList: IdList,
    state: EditorState,
    args: T
  ): [newIdList: IdList, newState: EditorState];
};

export const allHandlers: ClientMutationHandler<any>[] = [];
