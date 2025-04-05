import { ClientMutation } from "./client_mutations";

export type ClientMutationMessage = {
  type: "mutation";
  mutations: ClientMutation[];
  clientCounter: number;
};

export type ClientMessage = ClientMutationMessage;
