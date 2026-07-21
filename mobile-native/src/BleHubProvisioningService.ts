import { BleClient, numbersToDataView, dataViewToText } from '@capacitor-community/bluetooth-le';

const SERVICE = '7b7f0001-6f6a-6f2d-6875-622d70726f76';
const INFO_CHARACTERISTIC = '7b7f0002-6f6a-6f2d-6875-622d70726f76';
const CLAIM_CHARACTERISTIC = '7b7f0003-6f6a-6f2d-6875-622d70726f76';

export type DiscoveredHub = { deviceId: string; name?: string };

export class BleHubProvisioningService {
  async initialize(): Promise<void> { await BleClient.initialize({ androidNeverForLocation: true }); }

  async scan(durationMs = 10_000): Promise<DiscoveredHub[]> {
    const devices = new Map<string, DiscoveredHub>();
    await BleClient.requestLEScan({ services: [SERVICE], allowDuplicates: false }, result => {
      devices.set(result.device.deviceId, { deviceId: result.device.deviceId, name: result.device.name });
    });
    await new Promise(resolve => setTimeout(resolve, durationMs));
    await BleClient.stopLEScan();
    return [...devices.values()];
  }

  async readHubInfo(deviceId: string): Promise<Record<string, unknown>> {
    await BleClient.connect(deviceId);
    try {
      const value = await BleClient.read(deviceId, SERVICE, INFO_CHARACTERISTIC);
      return JSON.parse(dataViewToText(value)) as Record<string, unknown>;
    } finally {
      await BleClient.disconnect(deviceId);
    }
  }

  async submitClaimPackage(deviceId: string, signedClaimPackage: Uint8Array): Promise<void> {
    if (signedClaimPackage.byteLength > 480) throw new Error('Claim package exceeds the BLE onboarding limit.');
    await BleClient.connect(deviceId);
    try {
      await BleClient.write(deviceId, SERVICE, CLAIM_CHARACTERISTIC, numbersToDataView([...signedClaimPackage]));
    } finally {
      await BleClient.disconnect(deviceId);
    }
  }
}
