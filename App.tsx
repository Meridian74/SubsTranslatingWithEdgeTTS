import React, { useState, useEffect } from 'react';
import { Card } from './components/Card';
import { Modal } from './components/Modal';
import { AITool, ToolId } from './types';
import { SrtAudioGenerator } from './components/tools/SrtAudioGenerator';
import { isValidSrt, MOJIBAKE_REGEX } from './utils';

// Icons
const AudioIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
  </svg>
);

// Define available tools - CSAK hanggenerátor marad
const TOOLS: AITool[] = [
  {
    id: ToolId.SRT_AUDIO_GENERATOR,
    title: "Magyar felirat Felolvasó",
    description: "Magyar nyelvű .srt fájlok felolvasása Microsoft Edge-TTS neurális hangokkal, időzítés tartásával, letölthető audio formátumban.",
    icon: <AudioIcon />
  }
  // A fordító kártya ELTÁVOLÍTVA
];

export default function App() {
  const [activeTool, setActiveTool] = useState<AITool | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // File State managed by Parent
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [fileEncoding, setFileEncoding] = useState<string>('windows-1250'); // Alapértelmezetten ANSI
  const [fileReadError, setFileReadError] = useState('');

  // Reset when tool changes
  const handleToolClick = (tool: AITool) => {
    setActiveTool(tool);
    setFile(null);
    setFileContent('');
    setFileReadError('');
    
    // Mindig windows-1250 encoding, mert csak magyar hanggenerálás van
    setFileEncoding('windows-1250');
    
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setActiveTool(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setFileContent('');
      setFileReadError('');
    }
  };

  useEffect(() => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (fileEncoding === 'windows-1250' && MOJIBAKE_REGEX.test(content)) {
        console.warn("Detected UTF-8 file read as Windows-1250. Auto-switching to UTF-8.");
        setFileEncoding('UTF-8');
        return;
      }
      setFileContent(content);
    };
    reader.onerror = () => {
      setFileReadError('Hiba a fájl olvasásakor.');
    };
    reader.readAsText(file, fileEncoding);
  }, [file, fileEncoding]);


  return (
    <div className="min-h-screen bg-background text-slate-100 p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        <header className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 mb-4">
            SRT Magyar Hanggenerátor
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Konvertáld magyar SRT feliratokat hangfájllá Microsoft Edge-TTS neurális magyar hangokkal.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TOOLS.map(tool => (
            <Card key={tool.id} tool={tool} onClick={handleToolClick} />
          ))}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={activeTool?.title || ''}
      >
        <div className="space-y-6">
          {/* File Input Section */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-400">
              Magyar SRT fájl feltöltése
            </label>
            <div className="flex flex-col md:flex-row gap-4">
                 <div className="flex items-center space-x-4">
                    <label className="cursor-pointer bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition-colors border border-slate-600">
                        <span>Fájl kiválasztása</span>
                        <input 
                        type="file" 
                        accept=".srt" 
                        onChange={handleFileChange} 
                        className="hidden" 
                        />
                    </label>
                    <span className="text-sm text-slate-400 truncate max-w-xs">
                        {file ? file.name : 'Nincs fájl kiválasztva'}
                    </span>
                 </div>

                 {/* Encoding Selector - Mindig látható magyar fájlokhoz */}
                 <div className="flex items-center gap-2">
                     <label className="text-sm text-slate-400">Kódolás:</label>
                     <select 
                        value={fileEncoding}
                        onChange={(e) => setFileEncoding(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-md p-2 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                     >
                        <option value="windows-1250">ANSI (magyar)</option>
                        <option value="UTF-8">UTF-8</option>
                     </select>
                 </div>
            </div>
            {fileReadError && <p className="text-red-400 text-xs">{fileReadError}</p>}
          </div>

          {/* Content Preview / Editor */}
          {fileContent && (
             <div className="space-y-2">
               <label className="block text-sm font-medium text-slate-400">
                 Fájl tartalom ellenőrzése
               </label>
               <textarea
                 value={fileContent}
                 onChange={(e) => setFileContent(e.target.value)}
                 rows={6}
                 className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm font-mono text-slate-300 focus:ring-2 focus:ring-blue-500 outline-none resize-y"
               />
               {!isValidSrt(fileContent) && (
                 <p className="text-red-400 text-xs">
                   ⚠️ A formátum sérültnek tűnik. Ellenőrizd a kódolást vagy javítsd manuálisan.
                 </p>
               )}
             </div>
          )}

          <hr className="border-slate-700" />

          {/* Tool Specific Logic - CSAK hanggenerátor */}
          {activeTool?.id === ToolId.SRT_AUDIO_GENERATOR && (
              <SrtAudioGenerator 
                 fileContent={fileContent} 
                 filename={file ? file.name : ''} 
              />
          )}
          
          {/* Információs szekció */}
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
            <h4 className="text-blue-300 font-medium mb-2">ℹ️ Információ a szolgáltatásról:</h4>
            <ul className="text-sm text-blue-200 space-y-1">
              <li>• Microsoft Edge-TTS neurális magyar hangok (Noémi, Szabolcs)</li>
              <li>• Teljesen ingyenes használat, nincs API kulcs szükséges</li>
              <li>• Automatikus időzítés-kezelés és hanggyorsítás (max 20%)</li>
              <li>• Kimenet: MP3 fájl letölthető formátumban</li>
              <li>• Lokális futtatás: Python backend szükséges a hanggeneráláshoz</li>
            </ul>
          </div>
        </div>
      </Modal>
      
      {/* Footer */}
      <div className="mt-12 pt-8 border-t border-slate-700 text-center text-slate-500 text-sm">
        <p>SRT Magyar Hanggenerátor • Microsoft Edge-TTS • Lokális futtatás</p>
        <p className="mt-2 text-xs">
          Megjegyzés: A hanggeneráláshoz Python backend szükséges (localhost:8000)
        </p>
      </div>
    </div>
  );
}
