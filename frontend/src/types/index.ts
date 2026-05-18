export interface Device {
  id: string;
  name: string;
  type: string;
  state: string;
  status: string;
  category: string;
  isSheddable: boolean;
  powerUsage: number;
}

export interface EnergyData {
  grid: string;
  voltage: number;
  status: string;
  battery: number;
  solar: number;
  forecast: string;
}

/** Props for DeviceHUDCard — React `key` is passed separately, not part of this interface. */
export interface DeviceCardProps {
  device: Device;
  onToggle: () => void;
  isExpanded: boolean;
  onExpand: () => void;
}

export type TrustLogType = 'success' | 'warning' | 'info' | 'error';

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: string;
  timestamp: string;
  type: 'anomaly' | 'vendor' | 'energy' | 'health' | 'system' | 'security';
}

export interface SystemData {
  devices: Device[];
  mode: string;
  location: string;
  updateAvailable: boolean;
  subscriptionActive: boolean;
  powerSource: 'MAINS' | 'INVERTER' | 'GENERATOR';
  duressActive: boolean;
  assistantName: string;
  voice: {
    persona: string;
    pitch: number;
    rate: number;
  };
  alerts: Alert[];
  energy: EnergyData;
  accessProfiles: unknown[];
}

export interface HAStatus {
  connected: boolean;
  hub: string;
  version: string;
  syncedDevices: number;
}

export interface TrustLog {
  id: string;
  message: string;
  timestamp: string;
  type?: TrustLogType;
}

export interface VoltagePoint {
  time: string;
  voltage: number;
}
