import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { io } from 'socket.io-client';
import type { Alert, HAStatus, SystemData, TrustLog, TrustLogType, VoltagePoint } from '../types/index.ts';

interface UseSystemSocketOptions {
  setData: Dispatch<SetStateAction<SystemData | null>>;
  setHaStatus: Dispatch<SetStateAction<HAStatus | null>>;
  setVoltageHistory: Dispatch<SetStateAction<VoltagePoint[]>>;
  setTrustLogs: Dispatch<SetStateAction<TrustLog[]>>;
  speakResponse: (text: string) => void;
  addTrustLog: (message: string, type?: TrustLogType) => void;
  setShowVoiceOverlay: (open: boolean) => void;
  setNlpResponse: (msg: string | null) => void;
  setSpatialPulseMessage: (msg: string | null) => void;
  setIsLocalConnection: (local: boolean) => void;
  fetchStates: () => Promise<void>;
}

export function useSystemSocket(options: UseSystemSocketOptions) {
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    const {
      setData,
      setHaStatus,
      setVoltageHistory,
      setTrustLogs,
      fetchStates,
    } = optsRef.current;

    void fetchStates();

    const socket = io();
    socket.on('state_update', (jsonStates: SystemData) => {
      const { speakResponse } = optsRef.current;

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
    });

    socket.on('trust_log_update', (log: TrustLog) => {
      const { speakResponse } = optsRef.current;
      setTrustLogs((prev) => [log, ...prev].slice(0, 20));
      if (log.message.includes('CRITICAL') || log.message.includes('ALERT')) {
        void Promise.resolve(speakResponse(log.message)).catch(() => {});
      }
    });

    socket.on('sensor_update', (payload: { topic: string; data: { voltage: number } }) => {
      if (payload.topic.includes('power/grid')) {
        setVoltageHistory((prev) => {
          const newHistory = [
            ...prev,
            { time: new Date().toLocaleTimeString(), voltage: payload.data.voltage },
          ];
          return newHistory.slice(-20);
        });
      }
    });

    socket.on('motion-detected', (payload: { room: string; timestamp: string }) => {
      const { addTrustLog, setShowVoiceOverlay, setNlpResponse } = optsRef.current;
      addTrustLog(`MOTION_SENSOR: Activity detected in ${payload.room}`, 'warning');
      if (payload.room === 'Living Room') {
        setShowVoiceOverlay(true);
        setNlpResponse(`Motion detected in ${payload.room}. Activating peripheral surveillance.`);
        setTimeout(() => {
          setNlpResponse(null);
          setShowVoiceOverlay(false);
        }, 8000);
      }
    });

    socket.on('phone_sonar_active', (payload: { room: string }) => {
      const { setSpatialPulseMessage } = optsRef.current;
      setSpatialPulseMessage(`SONAR_PING_ACTIVE: ${payload.room}`);
      setTimeout(() => setSpatialPulseMessage(null), 10000);
    });

    const p2pInterval = setInterval(async () => {
      const res = await fetch(`/api/network/p2p-check?local=${Math.random() > 0.5}`);
      const json = await res.json();
      void json;
    }, 10000);

    const interval = setInterval(() => {
      fetch('/api/ha/status')
        .then((res) => res.json())
        .then((jsonHa: HAStatus) => setHaStatus(jsonHa))
        .catch(() => {});
    }, 5000);

    return () => {
      clearInterval(p2pInterval);
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);
}
