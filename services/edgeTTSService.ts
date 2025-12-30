// services/edgeTTSService.ts
const BACKEND_URL = 'http://localhost:8000';

export interface VoiceInfo {
  id: string;
  name: string;
  displayName: string;
  locale: string;
  gender: string;
  language: string;
  neural: boolean;
}

export class TTSConnectionError extends Error {
  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = 'TTSConnectionError';
  }
}

export class EdgeTTSService {
  private backendUrl: string;
  
  constructor(backendUrl: string = BACKEND_URL) {
    this.backendUrl = backendUrl;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.backendUrl}/health`);
      if (!response.ok) return false;
      const data = await response.json();
      return data.status === 'healthy';
    } catch { return false; }
  }

  async getAvailableVoices(): Promise<Array<{value: string, label: string}>> {
    try {
      const isHealthy = await this.checkHealth();
      if (!isHealthy) return [{ value: 'hu-HU-TamasNeural', label: 'Tamás (magyar férfi)' }];
      const response = await fetch(`${this.backendUrl}/voices/hungarian`);
      const voicesData: VoiceInfo[] = await response.json();
      return voicesData.map(voice => ({
        value: voice.id,
        label: `${voice.displayName} (${voice.gender === 'Male' ? 'férfi' : 'női'})`
      }));
    } catch {
      return [{ value: 'hu-HU-TamasNeural', label: 'Tamás (magyar férfi)' }];
    }
  }

  // MÓDOSÍTOTT: Fogadja a target_duration_ms-t
  async generateSpeech(text: string, voice: string, targetDurationMs?: number): Promise<ArrayBuffer> {
    const params = new URLSearchParams({
      text: text,
      voice: voice,
      rate: '+0%',
      pitch: '+0Hz'
    });
    
    // Ha van célidőtartam, adjuk hozzá a kéréshez
    if (targetDurationMs) {
      params.append('target_duration_ms', Math.round(targetDurationMs).toString());
    }
    
    const url = `${this.backendUrl}/tts/direct?${params.toString()}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'audio/mpeg' }
      });
      
      if (!response.ok) throw new Error(`API hiba: ${response.status}`);
      return await response.arrayBuffer();
    } catch (err) {
      throw new TTSConnectionError(`Backend hiba: ${err instanceof Error ? err.message : 'Ismeretlen'}`, err);
    }
  }

  async getApiStatus() {
    const isHealthy = await this.checkHealth();
    const voices = await this.getAvailableVoices();
    return {
      healthy: isHealthy,
      message: isHealthy ? `Backend működik. ${voices.length} hang.` : 'Backend nem elérhető.'
    };
  }
}

export const edgeTTSService = new EdgeTTSService();