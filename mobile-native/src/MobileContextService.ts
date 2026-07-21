import { Capacitor } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';
import { apiFetch } from '../../src/lib/hubClient';

const LAST_GEOFENCE_KEY = 'ujo_last_geofence_event';

export class MobileContextService {
  private watchId?: string;

  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
    await LocalNotifications.requestPermissions();
    Network.addListener('networkStatusChange', status => {
      void apiFetch('/api/mobile/context', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connected: status.connected, connectionType: status.connectionType, observedAt: new Date().toISOString() })
      }).catch(() => undefined);
    });
  }

  async startForegroundLocationUpdates(onPosition?: (position: Position) => void): Promise<void> {
    if (!Capacitor.isNativePlatform() || this.watchId) return;
    this.watchId = await Geolocation.watchPosition({ enableHighAccuracy: false, timeout: 20_000, minimumUpdateInterval: 15_000 }, position => {
      if (!position) return;
      onPosition?.(position);
    });
  }

  async stopLocationUpdates(): Promise<void> {
    if (!this.watchId) return;
    await Geolocation.clearWatch({ id: this.watchId });
    this.watchId = undefined;
  }

  async publishGeofenceEvent(placeId: string, event: 'ENTER' | 'EXIT'): Promise<void> {
    const marker = `${placeId}:${event}:${new Date().toISOString().slice(0, 13)}`;
    const previous = await Preferences.get({ key: LAST_GEOFENCE_KEY });
    if (previous.value === marker) return;
    const response = await apiFetch(`/api/geofences/${encodeURIComponent(placeId)}/event`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event })
    });
    if (!response.ok) throw new Error('The hub rejected the geofence event.');
    const result = await response.json() as { notification?: { title?: string; message?: string } };
    await Preferences.set({ key: LAST_GEOFENCE_KEY, value: marker });
    if (result.notification?.message) {
      await LocalNotifications.schedule({ notifications: [{ id: Date.now() % 2147483647, title: result.notification.title || 'Ujo', body: result.notification.message, schedule: { at: new Date(Date.now() + 500) } }] });
    }
  }
}
