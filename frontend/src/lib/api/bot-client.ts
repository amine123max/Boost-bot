import { invoke, withAddr, getAppErrorMessage } from './transport';
import { readBotActivity } from '../bot-activity';

export interface BotLaunch {
  url: string;
  toolsAllowed: boolean;
}
export const botClient = {
  async activity() {
    return readBotActivity(await invoke<unknown>('service_bot_activity', withAddr(), { timeoutMs: 3000, retries: 0 }));
  },
  async open() {
    try { return await invoke<BotLaunch>('service_bot_open', withAddr(), { timeoutMs: 60_000, retries: 0 }); }
    catch (error) {
      if (/unknown_method|method not found/i.test(getAppErrorMessage(error))) throw new Error('当前连接的服务版本不支持 Boost 智能体，请启动本项目的新版本 Boost 服务');
      throw error;
    }
  },
};
