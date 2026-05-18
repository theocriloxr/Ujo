import { useState, useCallback } from 'react';
import type { Alert, HAStatus, SystemData, VoltagePoint } from '../types/index.ts';

export function useSystemState(speakResponse: (text: string) => void) {
  const [data, setData] = useState<SystemData | null>(null);
  const [haStatus, setHaStatus] = useState<HAStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [voltageHistory, setVoltageHistory] = useState<VoltagePoint[]>([]);

  const fetchStates = useCallback(async () => {
    try {
      const fetchWithLog = async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) console.warn(`Fetch to ${url} returned ${res.status}`);
        return res;
      };

      const [resStates, resHa] = await Promise.all([
        fetchWithLog('/api/states'),
        fetchWithLog('/api/ha/status'),
      ]);

      if (!resStates.ok || !resHa.ok) {
        throw new Error(`Server returned error: ${resStates.status} / ${resHa.status}`);
      }

      const jsonStates = await resStates.json();
      const jsonHa = await resHa.json();

      setData((prevData) => {
        const announceUpdate = jsonStates.updateAvailable && !prevData?.updateAvailable;
        let newAlerts: Alert[] = [];
        if (jsonStates.alerts) {
          newAlerts = jsonStates.alerts.filter(
            (a: Alert) => !prevData?.alerts?.some((da: Alert) => da.id === a.id)
          );
        }
        queueMicrotask(() => {
          if (announceUpdate) {
            void Promise.resolve(
              speakResponse(
                'A system software update is available. Please review the details in the command center.'
              )
            ).catch(() => {});
          }
          newAlerts.forEach((alert: Alert) => {
            void Promise.resolve(
              speakResponse(`New system alert: ${alert.title}. ${alert.message}`)
            ).catch(() => {});
          });
        });
        return jsonStates;
      });

      setVoltageHistory((prev) => {
        const newHistory = [
          ...prev,
          { time: new Date().toLocaleTimeString(), voltage: jsonStates.energy.voltage },
        ];
        return newHistory.slice(-20);
      });

      setHaStatus(jsonHa);
      setLoading(false);
    } catch (err) {
      if (err instanceof Error) {
        console.error('Failed to fetch data:', err.name, err.message);
      } else {
        console.error('Failed to fetch data:', err);
      }
    }
  }, [speakResponse]);

  return {
    data,
    setData,
    haStatus,
    setHaStatus,
    loading,
    voltageHistory,
    setVoltageHistory,
    fetchStates,
  };
}
