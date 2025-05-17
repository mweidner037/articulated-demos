import { ClientMutation } from "./client_mutations";

export type ClientMutationMessage = {
  type: "mutation";
  clientId: string;
  mutations: ClientMutation[];
};

export type ClientMessage = ClientMutationMessage;
