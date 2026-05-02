import { GoogleGenAI } from "@google/genai";

/**
 * BABEL FISH: SPATIAL TRANSLATION SERVICE
 * 
 * Uses Gemini 3.1 Flash to perform high-fidelity pidgin/local dialect translations
 * for intercom communication between family members and staff.
 */
export class TranslatorService {
  private genAI: GoogleGenAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenAI({ apiKey });
    } else {
      console.warn("GEMINI_API_KEY missing - Translator will use fallback.");
    }
  }

  public async translateToDialect(text: string, dialect: 'PIDGIN' | 'HAUSA' | 'YORUBA' | 'IGBO' = 'PIDGIN'): Promise<string> {
    if (!this.genAI) return text;
    try {
      const prompt = `
        You are Ujo OS, a smart home assistant in Nigeria. 
        Translate the following message into authentic, natural-sounding ${dialect}.
        This will be played over the inter-com so keep it conversational and respectful.
        
        Original English: "${text}"
        
        Translation only:
      `;

      const result = await this.genAI.models.generateContent({
        model: "gemini-3.1-flash",
        contents: prompt
      });
      return result.text || text;
    } catch (err) {
      console.error("Translation Error:", err);
      // Fail gracefully with the original text
      return text;
    }
  }
}
