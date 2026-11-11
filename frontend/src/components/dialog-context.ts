import type { InjectionKey, Ref } from "vue";
export interface DialogContext {
  footer: Ref<HTMLElement | undefined>;
  actions: Ref<number>;
  formId: string;
}
export const dialogContext: InjectionKey<DialogContext> =
  Symbol("boost-dialog");
