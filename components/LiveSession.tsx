import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Radio, Activity, X } from 'lucide-react';
import { LiveClient } from '../services/geminiService';

interface LiveSessionProps {
  isOpen: boolean;
  onClose: (transcript?: string) => void;
}

const LiveSession: React.FC<LiveSessionProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<string>('disconnected');
  const [transcript, setTranscript] = useState<string>('');
  const [volume, setVolume] = useState<number>(0);
  const liveClientRef = useRef<LiveClient | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTranscript(''); // Reset transcript on open
      setVolume(0);
      if (!liveClientRef.current) {
        liveClientRef.current = new LiveClient(
          (text) => console.log(text),
          (newText) => setTranscript(prev => prev + newText),
          (st) => setStatus(st),
          (vol) => setVolume(vol) // Update volume state
        );
        liveClientRef.current.connect();
      }
    } else {
      // Cleanup happens in handleClose or unmount
    }

    return () => {
      if (liveClientRef.current) {
        liveClientRef.current.disconnect();
        liveClientRef.current = null;
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (status === 'connected' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dataArray = new Uint8Array(128); // Standard size matching analyser logic

      const draw = () => {
        animationRef.current = requestAnimationFrame(draw);
        if (!liveClientRef.current || !canvas) return;

        liveClientRef.current.getFrequencies(dataArray);

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const numBars = 32; 
        const barWidth = (canvas.width / numBars) - 2;
        let x = 0;
        
        ctx.lineCap = 'round';

        for (let i = 0; i < numBars; i++) {
          // Smooth out array selection over 128 items
          const step = Math.floor(128 / numBars);
          const rawValue = dataArray[i * step];
          // Scale to canvas height
          const barHeight = Math.max(4, (rawValue / 255) * canvas.height);

          // Center the bars vertically mapping
          const y = (canvas.height - barHeight) / 2;

          ctx.fillStyle = `rgba(99, 102, 241, ${0.4 + (rawValue / 255)})`; // indigo-500 fading

          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 4);
          ctx.fill();

          x += barWidth + 2;
        }
      };

      draw();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [status]);

  const handleClose = () => {
    if (liveClientRef.current) {
      liveClientRef.current.disconnect();
      liveClientRef.current = null;
    }
    onClose(transcript); // Pass transcript back to App
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-8 flex flex-col items-center shadow-2xl relative">
        <button 
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <div className="mb-6 relative">
          <div className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${status === 'connected' ? 'bg-indigo-500/20' : 'bg-slate-800'}`}>
             <div className={`absolute inset-0 rounded-full border-2 transition-all duration-300 ${status === 'connected' ? 'border-indigo-400 opacity-50' : 'border-slate-600'}`}
                  style={{ transform: `scale(${1 + (volume / 100) * 0.3})` }}
             ></div>
             <Mic size={40} className={status === 'connected' ? 'text-indigo-400' : 'text-slate-500'} />
          </div>
          
          {/* Status Dot */}
          <div className={`absolute bottom-0 right-0 w-6 h-6 rounded-full border-4 border-slate-900 ${
              status === 'connected' ? 'bg-green-500' : 
              status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
          }`}></div>
        </div>

        <h2 className="text-2xl font-bold text-white mb-2">Live Interview</h2>
        <p className="text-slate-400 text-center mb-8">
          Gemini Live is listening. Speak naturally to build your persona file.
        </p>
        
        {/* Audio Visualizer */}
        {status === 'connected' ? (
          <div className="h-16 flex items-center justify-center mb-6 w-full px-8">
            <canvas ref={canvasRef} width={300} height={64} className="w-full h-full" />
          </div>
        ) : (
            <div className="h-16 flex items-center justify-center mb-6 text-slate-500 text-sm animate-pulse">
                {status === 'connecting' ? 'Establishing connection...' : 'Disconnected'}
            </div>
        )}

        {/* Transcript Preview */}
        <div className="w-full bg-slate-800/50 rounded-xl p-4 border border-slate-700 h-32 flex flex-col">
            <div className="flex items-center gap-2 mb-2 text-xs text-slate-500 uppercase tracking-wider font-semibold">
                <Activity size={12} />
                <span>Live Transcript</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {transcript ? (
                    <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{transcript}</p>
                ) : (
                    <p className="text-sm text-slate-600 italic">Conversation will appear here...</p>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default LiveSession;