// ./component/tools/SrtAudioGenerator.tsx
import React, { useState, useRef, useEffect } from 'react';
import { edgeTTSService, TTSConnectionError } from '../../services/edgeTTSService';
import { 
    parseSrtToSegments, 
    extractSrtTimestamps, 
    validateAndFixSegments, 
    sanitizeTextForTts, 
    playSuccessChime, 
    playWarningSound,
    pcmToMp3,
    sleep 
} from '../../utils';

interface SrtAudioGeneratorProps {
    fileContent: string;
    filename: string;
    onAbort?: () => void;
}

const decodeAudioData = async (arrayBuffer: ArrayBuffer): Promise<AudioBuffer> => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return await audioCtx.decodeAudioData(arrayBuffer);
};

export const SrtAudioGenerator: React.FC<SrtAudioGeneratorProps> = ({ 
    fileContent, 
    filename,
    onAbort 
}) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [status, setStatus] = useState('');
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState('');
    const [audioUrl, setAudioUrl] = useState('');
    const [selectedVoice, setSelectedVoice] = useState<string>('hu-HU-TamasNeural');
    const [availableVoices, setAvailableVoices] = useState<Array<{value: string, label: string}>>([]);
    const [apiStatus, setApiStatus] = useState<string>('Kapcsolódás...');
    const [debugSegments, setDebugSegments] = useState<any[]>([]);
    const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number>(-1);
    
    const abortRef = useRef<boolean>(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const masterBuffersRef = useRef<Array<{buffer: AudioBuffer, startTime: number}>>([]);
    const resumeIndexRef = useRef<number>(0);
    const activeRowRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (activeRowRef.current) {
            activeRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [currentSegmentIndex]);

    useEffect(() => {
        const initVoices = async () => {
            try {
                const statusInfo = await edgeTTSService.getApiStatus();
                setApiStatus(statusInfo.message);
                const voices = await edgeTTSService.getAvailableVoices();
                setAvailableVoices(voices);
                if (voices.length > 0 && !selectedVoice) {
                    setSelectedVoice(voices[0].value);
                }
            } catch {
                setAvailableVoices([{ value: 'hu-HU-TamasNeural', label: 'Tamás (férfi)' }]);
            }
        };
        initVoices();
    }, []);

    useEffect(() => {
        if (fileContent) {
            const segments = parseSrtToSegments(fileContent);
            const validTimes = extractSrtTimestamps(fileContent);
            const clean = validateAndFixSegments(segments, validTimes);
            setDebugSegments(clean);
            masterBuffersRef.current = [];
            resumeIndexRef.current = 0;
            setAudioUrl('');
            setResult('');
            setProgress(0);
            setCurrentSegmentIndex(-1);
            setStatus('');
        }
    }, [fileContent]);

    const processAudioSegments = async () => {
        if (!debugSegments.length) return;
        setIsProcessing(true);
        setIsPaused(false);
        abortRef.current = false;
        abortControllerRef.current = new AbortController();

        try {
            for (let i = resumeIndexRef.current; i < debugSegments.length; i++) {
                if (abortRef.current) return;

                const segment = debugSegments[i];
                setCurrentSegmentIndex(i);
                setStatus(`Generálás: ${i + 1} / ${debugSegments.length}`);
                
                const targetDurationMs = (segment._endSec - segment._startSec) * 1000;

                try {
                    const arrayBuffer = await edgeTTSService.generateSpeech(
                        sanitizeTextForTts(segment.text), 
                        selectedVoice,
                        targetDurationMs
                    );
                    const audioBuffer = await decodeAudioData(arrayBuffer);
                    
                    masterBuffersRef.current.push({
                        buffer: audioBuffer,
                        startTime: segment._startSec
                    });

                    if (i < debugSegments.length - 1 && !abortRef.current) {
                        setStatus(`Várakozás (1s limit védelem)...`);
                        await sleep(1000);
                    }

                } catch (err) {
                    if (err instanceof TTSConnectionError) {
                        setIsPaused(true);
                        resumeIndexRef.current = i;
                        playWarningSound();
                        setStatus("Hiba: Backend hiba.");
                        return;
                    }
                    throw err;
                }
                
                setProgress(Math.floor(((i + 1) / debugSegments.length) * 90));
                resumeIndexRef.current = i + 1;
            }

            setStatus("Keverés és véglegesítés...");
            await renderAndDownload();
            
        } catch (error: any) {
            setStatus(`Hiba: ${error.message}`);
            setIsProcessing(false);
        }
    };

    const renderAndDownload = async () => {
        const buffers = masterBuffersRef.current;
        if (buffers.length === 0) return;

        let currentTimelinePos = 0;
        const scheduledBuffers: Array<{buffer: AudioBuffer, startTime: number}> = [];

        for (let i = 0; i < buffers.length; i++) {
            const item = buffers[i];
            let startTime = item.startTime;
            if (startTime < currentTimelinePos) {
                startTime = currentTimelinePos;
            }
            scheduledBuffers.push({
                buffer: item.buffer,
                startTime: startTime
            });
            currentTimelinePos = startTime + item.buffer.duration;
        }

        const totalDuration = currentTimelinePos;
        const sampleRate = 24000;

        // MÓDOSÍTÁS: 2 csatorna (sztereó) beállítása
        const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);

        scheduledBuffers.forEach(item => {
            const source = offlineCtx.createBufferSource();
            source.buffer = item.buffer;
            
            // A Web Audio API automatikusan elosztja a mono jelet mindkét sztereó csatornára (panning: center)
            source.connect(offlineCtx.destination);
            source.start(item.startTime);
        });

        const renderedBuffer = await offlineCtx.startRendering();
        
        // MÓDOSÍTÁS: Az MP3 enkódernek még mindig egy mono tömböt adunk át a pcmToMp3-nak, 
        // de a renderelt buffer bal csatornáját vesszük ki (ami most már megegyezik a jobbal).
        const rawData = renderedBuffer.getChannelData(0); 
        
        const int16Data = new Int16Array(rawData.length);
        for (let i = 0; i < rawData.length; i++) {
            const s = Math.max(-1, Math.min(1, rawData[i]));
            int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        const mp3Blob = pcmToMp3(int16Data, sampleRate);
        setAudioUrl(URL.createObjectURL(mp3Blob));
        setResult("Sikeresen elkészült!");
        setProgress(100);
        setIsProcessing(false);
        playSuccessChime();
    };

    const handleAbort = () => {
        abortRef.current = true;
        setIsProcessing(false);
        setIsPaused(false);
        if (onAbort) onAbort();
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="bg-slate-800 p-4 rounded-lg flex justify-between items-center shadow-inner">
                <div>
                    <p className="text-xs text-slate-400 mb-1">Választott hang:</p>
                    <select 
                        value={selectedVoice} 
                        onChange={(e) => setSelectedVoice(e.target.value)}
                        disabled={isProcessing || isPaused}
                        className="bg-slate-700 text-white rounded px-2 py-1 text-sm w-64 border border-slate-600 focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                        {availableVoices.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                    </select>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-slate-500 truncate max-w-[200px]">{filename || "Nincs fájl"}</p>
                    <div className="text-2xl font-mono font-bold text-blue-400">{progress}%</div>
                </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-900 rounded-lg border border-slate-700 custom-scrollbar">
                <table className="w-full text-[11px] text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-800 z-10 shadow-sm">
                        <tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700">
                            <th className="p-2 w-20">Időpont</th>
                            <th className="p-2 w-16 text-center">Hossz</th>
                            <th className="p-2">Szöveg</th>
                        </tr>
                    </thead>
                    <tbody>
                        {debugSegments.length > 0 ? debugSegments.map((seg, idx) => (
                            <tr 
                                key={idx} 
                                ref={idx === currentSegmentIndex ? (activeRowRef as any) : null}
                                className={`transition-colors duration-200 ${idx === currentSegmentIndex ? 'bg-blue-600/20 text-blue-100' : 'text-slate-400 hover:bg-slate-800/50'}`}
                            >
                                <td className="p-2 font-mono border-b border-slate-800/50">{seg.startTime}</td>
                                <td className="p-2 font-mono text-center text-slate-500 border-b border-slate-800/50">
                                    {(seg._endSec - seg._startSec).toFixed(1)}s
                                </td>
                                <td className="p-2 border-b border-slate-800/50 leading-relaxed">{seg.text}</td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={3} className="p-8 text-center text-slate-500 italic">Nincs betöltött fájl...</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {status && (
                <div className="flex items-center justify-center space-x-2 text-sm text-blue-400 py-1">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></span>
                    <span>{status}</span>
                </div>
            )}

            <div className="flex space-x-3">
                {isPaused ? (
                    <button onClick={processAudioSegments} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold transition-all shadow-lg">Folytatás</button>
                ) : !isProcessing ? (
                    <button 
                        onClick={processAudioSegments} 
                        disabled={!fileContent}
                        className={`flex-1 py-3 rounded-xl font-bold transition-all shadow-lg ${!fileContent ? 'bg-slate-700 text-slate-500' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                    >
                        Hang generálása
                    </button>
                ) : (
                    <button onClick={handleAbort} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold transition-all shadow-lg">Leállítás</button>
                )}
            </div>

            {audioUrl && (
                <div className="bg-slate-800 p-4 rounded-xl border border-blue-500/20 shadow-xl">
                    <audio controls src={audioUrl} className="w-full mb-4 h-10" />
                    <a 
                        href={audioUrl} 
                        download={`${filename.replace(/\.[^/.]+$/, "")}.mp3`} 
                        className="block w-full text-center bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-bold"
                    >
                        MP3 Letöltése
                    </a>
                </div>
            )}
        </div>
    );
};