// services/edgeTTSService.ts - TELJESEN ÚJ, BACKEND-HEZ ILLESZKEDŐ
const BACKEND_URL = 'http://localhost:8000'; // Python FastAPI backend

export interface VoiceInfo {
  id: string;
  name: string;
  displayName: string;
  locale: string;
  gender: string;
  language: string;
  neural: boolean;
}

export interface TTSResponse {
  success: boolean;
  message: string;
  file_url?: string;
  file_size?: number;
  voice?: string;
  duration_ms?: number;
}

export class EdgeTTSService {
  private backendUrl: string;
  
  constructor(backendUrl: string = BACKEND_URL) {
    this.backendUrl = backendUrl;
  }
  
  /**
   * Health check - ellenőrzi, hogy a backend működik-e
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.backendUrl}/health`, {
        timeout: 5000 // 5 másodperc timeout
      } as any);
      
      if (!response.ok) {
        console.warn(`Health check failed: ${response.status}`);
        return false;
      }
      
      const data = await response.json();
      return data.status === 'healthy';
      
    } catch (error) {
      console.warn('Backend health check failed:', error);
      return false;
    }
  }
  
  /**
   * Elérhető hangok listája - a backend /voices végpontját hívja
   */
  async getAvailableVoices(): Promise<Array<{value: string, label: string}>> {
    try {
      // Először ellenőrizzük az API állapotát
      const isHealthy = await this.checkHealth();
      
      if (!isHealthy) {
        console.warn('Backend nem elérhető, fallback hangok használata');
        return this.getFallbackVoices();
      }
      
      // Backend API hívás
      const response = await fetch(`${this.backendUrl}/voices/hungarian`);
      
      if (!response.ok) {
        throw new Error(`API hiba: ${response.status}`);
      }
      
      const voicesData: VoiceInfo[] = await response.json();
      
      // Átalakítás a React kompatibilis formátumba
      return voicesData.map(voice => ({
        value: voice.id,
        label: `${voice.displayName} (${voice.gender === 'Male' ? 'férfi' : 'női'})`
      }));
      
    } catch (error) {
      console.error('Hiba a hangok lekérésekor:', error);
      return this.getFallbackVoices();
    }
  }
  
  /**
   * Fallback hanglista - ha a backend nem elérhető
   */
  private getFallbackVoices(): Array<{value: string, label: string}> {
    return [
      { value: 'hu-HU-SzabolcsNeural', label: 'Szabolcs (magyar férfi)' },
      { value: 'hu-HU-NoemiNeural', label: 'Noémi (magyar női)' },
      { value: 'hu-HU-TamasNeural', label: 'Tamás (magyar férfi)' },
    ];
  }
  
  /**
   * Fő TTS függvény - a React komponens ezt hívja
   */
  async generateSpeech(text: string, voice: string): Promise<ArrayBuffer> {
    console.log(`Edge-TTS hívás: "${text.substring(0, 50)}..." hang: ${voice}`);
    
    try {
      // Először próbáljuk a backend direct API-t
      return await this.generateSpeechDirect(text, voice);
      
    } catch (directError) {
      console.warn('Direct API hiba, próbálom JSON API-t:', directError);
      
      try {
        // Ha a direct nem megy, próbáljuk a JSON API-t
        return await this.generateSpeechViaJSON(text, voice);
        
      } catch (jsonError) {
        console.error('Mindkét API hiba, fallback mock:', jsonError);
        
        // Végső fallback: mock audio
        return await this.generateMockAudio(text);
      }
    }
  }
  
  /**
   * Direct API hívás - hangfájlt ad vissza közvetlenül
   */
  private async generateSpeechDirect(text: string, voice: string): Promise<ArrayBuffer> {
    const params = new URLSearchParams({
      text: text,
      voice: voice,
      rate: '+0%',
      pitch: '+0Hz'
    });
    
    const url = `${this.backendUrl}/tts/direct?${params.toString()}`;
    
    console.log(`Direct API hívás: ${url.substring(0, 100)}...`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'audio/mpeg'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Direct TTS hiba ${response.status}: ${errorText.substring(0, 100)}`);
    }
    
    const audioBuffer = await response.arrayBuffer();
    
    if (audioBuffer.byteLength < 1024) {
      throw new Error('Túl kicsi hangfájl érkezett');
    }
    
    console.log(`✓ Direct API válasz: ${audioBuffer.byteLength} bytes`);
    return audioBuffer;
  }
  
  /**
   * JSON API hívás - először JSON válasz, majd fájl letöltés
   */
  private async generateSpeechViaJSON(text: string, voice: string): Promise<ArrayBuffer> {
    const requestBody = {
      text: text,
      voice: voice,
      rate: '+0%',
      pitch: '+0Hz',
      volume: '+0%'
    };
    
    console.log('JSON API hívás...');
    
    // 1. TTS kérés küldése
    const ttsResponse = await fetch(`${this.backendUrl}/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      throw new Error(`TTS API hiba ${ttsResponse.status}: ${errorText.substring(0, 100)}`);
    }
    
    const result: TTSResponse = await ttsResponse.json();
    
    if (!result.success || !result.file_url) {
      throw new Error(result.message || 'Ismeretlen TTS hiba');
    }
    
    // 2. Hangfájl letöltése
    const audioUrl = `${this.backendUrl}${result.file_url}`;
    console.log(`Fájl letöltése: ${audioUrl}`);
    
    const audioResponse = await fetch(audioUrl);
    
    if (!audioResponse.ok) {
      throw new Error(`Audio letöltés hiba ${audioResponse.status}`);
    }
    
    const audioBuffer = await audioResponse.arrayBuffer();
    console.log(`✓ JSON API válasz: ${audioBuffer.byteLength} bytes`);
    
    return audioBuffer;
  }
  
  /**
   * Mock audio generálás - ha egyik API sem működik
   */
  private async generateMockAudio(text: string): Promise<ArrayBuffer> {
    console.warn('⚠️ MOCK AUDIO használata - backend nem elérhető');
    
    // Szimulált várakozás, mint valós API hívás
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock audio: 1 másodperc csend
    const sampleRate = 24000;
    const duration = 1.0;
    const numSamples = Math.floor(sampleRate * duration);
    
    const arrayBuffer = new ArrayBuffer(numSamples * 2); // 16-bit
    const view = new Int16Array(arrayBuffer);
    
    // Csend (0 értékek)
    for (let i = 0; i < numSamples; i++) {
      view[i] = 0;
    }
    
    return arrayBuffer;
  }
  
  /**
   * API státusz és információk
   */
  async getApiStatus(): Promise<{
    healthy: boolean;
    backendUrl: string;
    hungarianVoices: number;
    message: string;
  }> {
    try {
      const isHealthy = await this.checkHealth();
      
      if (!isHealthy) {
        return {
          healthy: false,
          backendUrl: this.backendUrl,
          hungarianVoices: this.getFallbackVoices().length,
          message: 'Backend nem elérhető. Mock módban működik.'
        };
      }
      
      // További információk, ha működik
      const voices = await this.getAvailableVoices();
      
      return {
        healthy: true,
        backendUrl: this.backendUrl,
        hungarianVoices: voices.length,
        message: `Backend működik. ${voices.length} magyar hang elérhető.`
      };
      
    } catch (error) {
      return {
        healthy: false,
        backendUrl: this.backendUrl,
        hungarianVoices: this.getFallbackVoices().length,
        message: `Hiba: ${error instanceof Error ? error.message : 'Ismeretlen hiba'}`
      };
    }
  }
}

// Singleton példány exportálása
export const edgeTTSService = new EdgeTTSService();