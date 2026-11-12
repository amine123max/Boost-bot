import { reactive } from 'vue';
export const botLaunch = reactive({ x: '50vw', y: '50vh', returnPath: '/', transition: 0, requested: false });
export function consumeBotLaunch() {
  const fromAvatar = botLaunch.transition > 0;
  const launch = {
    x: fromAvatar ? botLaunch.x : `${innerWidth / 2}px`,
    y: fromAvatar ? botLaunch.y : `${innerHeight / 2}px`,
    origin: fromAvatar ? 'avatar' : 'center',
    requested: botLaunch.requested,
  };
  botLaunch.transition = 0;
  botLaunch.requested = false;
  return launch;
}
export function requestBotLaunch(returnPath: string) {
  botLaunch.returnPath = returnPath;
  botLaunch.requested = true;
}
export function prepareBotLaunch(event: MouseEvent, returnPath: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const target = event.currentTarget as HTMLElement;
  const box = (target.querySelector('svg') ?? target).getBoundingClientRect();
  botLaunch.x = `${box.left + box.width / 2}px`;
  botLaunch.y = `${box.top + box.height / 2}px`;
  botLaunch.returnPath = returnPath;
  botLaunch.transition++;
  botLaunch.requested = true;
}
