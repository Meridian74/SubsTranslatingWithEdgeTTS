// services/edgeTTSService.ts
export class EdgeTTSService {
  private backendUrl = 'http://localhost:8000'; // Python backend URL
  
  async generateSpeech(text: string, voice: string): Promise<ArrayBuffer> {
    try {
      // Valós Edge-TTS hívás helyett most mock-oljuk
      console.log(`Edge-TTS hívás: "${text.substring(0, 50)}..." hang: ${voice}`);
      
      // Mock válasz - majd itt jön a Python backend API hívás
      await new Promise(resolve => setTimeout(resolve, 1000)); // Szimulált várakozás
      
      // Jelenleg mock, de itt jön majd a fetch a Python backend-hez
      // const response = await fetch(`${this.backendUrl}/api/tts`, {...});
      
      // Mock audio adat (csend)
      const mockAudio = new ArrayBuffer(1024);
      return mockAudio;
      
    } catch (error) {
      console.error('Edge TTS hiba:', error);
      throw error;
    }
  }
  
  getAvailableVoices(): Array<{value: string, label: string}> {
    return [
      { value: 'hu-HU-NoemiNeural', label: 'Noémi (magyar női)' },
      { value: 'hu-HU-SzabolcsNeural', label: 'Szabolcs (magyar férfi)' },
    ];
  }
}