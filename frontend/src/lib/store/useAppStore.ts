import type { ServiceStatus } from '../../types';
const state = {
 serviceStatus: { connected: false, version: '', uptime: 0, addr: 'localhost:48760' } as ServiceStatus,
 setServiceStatus(patch: Partial<ServiceStatus>) { Object.assign(state.serviceStatus, patch); },
};
export const useAppStore = { getState: () => state };
