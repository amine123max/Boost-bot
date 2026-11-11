import { invoke, withAddr } from "./transport";
export interface CodexConfig {
  path: string;
  content: string;
  exists: boolean;
}
export const codexConfigClient = {
  read: () =>
    invoke<CodexConfig>("service_codex_config_read", withAddr(), {
      timeoutMs: 10000,
      retries: 0,
    }),
};
