const marker = '/';
export const localPeer = /^local-[0-9a-f-]{36}$/;
export function consoleScope(botId: string, peer = 'console'): string {
  return peer === 'console' ? botId : botId + marker + peer;
}
export function splitConsoleScope(scope: string): [string, string] {
  const i = scope.indexOf(marker);
  return i < 0 ? [scope, 'console'] : [scope.slice(0, i), scope.slice(i + 1)];
}
export function consoleConversation(scope: string): string {
  const [bot, peer] = splitConsoleScope(scope);
  return `${bot}:web:${peer}`;
}
