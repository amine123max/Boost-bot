import { invoke, withAddr } from "./transport";
export interface ServiceTelemetry {
  address: string;
  processId: number;
  uploadBytesPerSecond: number;
  downloadBytesPerSecond: number;
  memoryBytes: number | null;
  cpuPercent: number | null;
  scope: "service_port_api_payload";
  uploadedBytes: number;
  downloadedBytes: number;
  activeRequests: number;
  uptimeSeconds: number | null;
  version: string;
  os: string;
  architecture: string;
  cpuModel: string;
  logicalCores: number;
  systemMemoryBytes: number;
}
export interface NetworkInfo {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  city: string;
  isp: string;
  organization: string;
  asn: number | null;
  timezone: string;
  viaProxy: boolean;
  queriedAt: number;
}
export const telemetryClient = {
  read: () =>
    invoke<ServiceTelemetry>("service_telemetry", withAddr(), {
      timeoutMs: 2500,
      retries: 0,
    }),
  networkInfo: (refresh = false) =>
    invoke<NetworkInfo>("service_network_info", withAddr({ refresh }), {
      timeoutMs: 12000,
      retries: 0,
    }),
};
