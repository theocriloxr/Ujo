import { useState, useCallback, useRef } from 'react';
import { Modality } from '@google/genai';
import { getGenAI, isGeminiApiKeyConfigured } from '../lib/gemini.ts';

export interface VoiceSettings {
  persona: string;
  pitch: number;
  speechRate: number;
}

const DEFAULT_VOICE: VoiceSettings = { persona: 'Ujo', pitch: 1.0, speechRate: 1.0 };

export function useVoice(isGlobalMuted: boolean, isSaaSTier: boolean) {
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(DEFAULT_VOICE);
  const audioContextRef = useRef<AudioContext | null>(null);

  const getTTSContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });
    }
    return audioContextRef.current;
  };

  const fetchVoiceSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/voice/settings');
      const json = await res.json();
      setVoiceSettings(json);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const saveVoiceSettings = useCallback(async (settings: VoiceSettings) => {
    try {
      await fetch('/api/voice/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      setVoiceSettings(settings);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const speakResponse = useCallback(
    async (text: string) => {
      if (isGlobalMuted) return;

      const ai = isGeminiApiKeyConfigured(process.env.GEMINI_API_KEY) ? getGenAI() : null;
      try {
        if (ai) {
          const persona = voiceSettings.persona || 'Ujo';
          const voiceName = persona === 'Jarvis' ? 'Charon' : persona === 'Samantha' ? 'Puck' : 'Fenrir';

          const ttsResp = await ai.models.generateContent({
            model: 'gemini-3.1-flash-tts-preview',
            contents: [{ parts: [{ text }] }],
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName } },
              },
            },
          });

          const base64Audio = ttsResp.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (base64Audio) {
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }

            const audioContext = getTTSContext();
            if (audioContext.state === 'suspended') {
              await audioContext.resume();
            }
            const audioBuffer = audioContext.createBuffer(1, bytes.length / 2, 24000);
            const channelData = audioBuffer.getChannelData(0);
            const dataView = new DataView(bytes.buffer);

            for (let i = 0; i < bytes.length / 2; i++) {
              channelData[i] = dataView.getInt16(i * 2, true) / 32768.0;
            }

            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.playbackRate.value = voiceSettings.speechRate || 1.0;
            source.detune.value = (voiceSettings.pitch - 1.0) * 1200;
            source.connect(audioContext.destination);
            source.start();
            return;
          }
        }
      } catch (e) {
        console.warn('Cloud TTS failed, falling back to enhanced local engine:', e);
      }

      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = voiceSettings.pitch || 1.0;
      utterance.rate = voiceSettings.speechRate || 1.0;

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const preferredVoices = voices.sort((a, b) => {
          const score = (v: SpeechSynthesisVoice) => {
            if (v.name.includes('Natural')) return 10;
            if (v.name.includes('Neural')) return 9;
            if (v.name.includes('Google') && v.name.includes('UK')) return 8;
            if (v.name.includes('Google') && v.name.includes('US')) return 7;
            if (v.name.includes('Samantha')) return 6;
            return 0;
          };
          return score(b) - score(a);
        });

        if (preferredVoices.length > 0) {
          utterance.voice = preferredVoices[0];
        }
      }

      utterance.pitch = isSaaSTier ? 1.05 : 0.95;
      utterance.rate = isSaaSTier ? 0.95 : 1.02;

      window.speechSynthesis.speak(utterance);
    },
    [isGlobalMuted, voiceSettings, isSaaSTier]
  );

  return {
    voiceSettings,
    speakResponse,
    fetchVoiceSettings,
    saveVoiceSettings,
  };
}
