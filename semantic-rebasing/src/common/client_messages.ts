import { ElementId } from "articulated";
import { ClientMutation } from "./client_mutations";

export type ClientHelloMessage = {
  type: "hello";
};

export type ClientMutationMessage = {
  type: "mutation";
  mutations: ClientMutation[];
};

export type ClientMessage = ClientHelloMessage;
