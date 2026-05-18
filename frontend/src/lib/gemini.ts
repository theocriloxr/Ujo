import { GoogleGenAI } from '@google/genai';

let client: GoogleGenAI | null = null;

const PLACEHOLDER_KEYS = new Set(['', 'MY_GEMINI_API_KEY', 'undefined', 'null']);

export function isGeminiApiKeyConfigured(apiKey?: string): boolean {
  const trimmed = apiKey?.trim();
  if (!trimmed) return false;
  return !PLACEHOLDER_KEYS.has(trimmed);
}

export function getGenAI(): GoogleGenAI | null {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!isGeminiApiKeyConfigured(apiKey)) return null;
  client = new GoogleGenAI({ apiKey: apiKey!.trim() });
  return client;
}
