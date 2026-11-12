import type { ServiceStatus } from '../../types';
const state = {
 serviceStatus: { connected: false, version: '', uptime: 0, addr: 'localhost:12580' } as ServiceStatus,
 setServiceStatus(patch: Partial<ServiceStatus>) { Object.assign(state.serviceStatus, patch); },
};
export const useAppStore = { getState: () => state };
