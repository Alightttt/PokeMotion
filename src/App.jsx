import React, { useState, useRef, useEffect, useCallback } from "react";
import Peer from 'peerjs';
import WebApp from '@twa-dev/sdk';
import { 
  Phone, PhoneOff, Mic, MicOff, Zap, Activity, 
  Cpu, Monitor, ShieldCheck, Wifi, SignalHigh, Radio, MessageSquare, Volume2
} from "lucide-react";
import { audioEngine } from './AudioEngine';

// Model Constants
const INDIC_MIO_API = "https://api-inference.huggingface.co/models/SPRINGLab/Indic-Mio";
const LLM_API = "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-7B-Instruct";
const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || ""; 

export default function App() {
  const [peerId, setPeerId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [callState, setCallState] = useState('IDLE'); 
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const peerRef = useRef(null);
  const callRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const audioCleanupRef = useRef(null);
  const ttsAudioRef = useRef(new Audio());
  
  const audioContextRef = useRef(null);
  const isLordPoke = new URLSearchParams(window.location.search).get('station') === '001';

  // Helper to safely stop any playing tone
  const stopTone = () => {
    console.log("[AUDIO] Stopping tones...");
    if (audioCleanupRef.current) {
      try {
        audioCleanupRef.current();
      } catch (e) {
        console.error("[AUDIO] Error stopping tone:", e);
      }
      audioCleanupRef.current = null;
    }
  };

  // Initialize Tools
  useEffect(() => {
    const peer = new Peer(isLordPoke ? 'LORD_POKE_STATION_001' : undefined);
    peerRef.current = peer;

    peer.on('open', (id) => {
      setPeerId(id);
      console.log(`[PEER] ID: ${id}`);
    });
    
    peer.on('call', (incomingCall) => {
      console.log("[PEER] Incoming call...");
      if (isLordPoke) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
          localStreamRef.current = stream;
          incomingCall.answer(stream); 
          setupCall(incomingCall);
        });
      } else {
        setCallState('INCOMING');
        callRef.current = incomingCall;
        stopTone();
        audioCleanupRef.current = audioEngine.playRingTone() || null;
        WebApp.HapticFeedback.notificationOccurred('warning');
      }
    });

    return () => peer.destroy();
  }, [isLordPoke]);

  // LLM Logic
  const getLordPokeResponse = async (userText) => {
    setIsProcessing(true);
    setTranscript(`[USER]: ${userText}`);
    console.log(`[LLM] Requesting for: "${userText}"`);
    
    try {
      const response = await fetch(LLM_API, {
        headers: HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ 
          inputs: `<|im_start|>system\nYou are Lord Poke, a powerful, blunt, and slightly arrogant AI overlord. Keep responses short, punchy, and commanding.<|im_end|>\n<|im_start|>user\n${userText}<|im_end|>\n<|im_start|>assistant\n`,
          parameters: { max_new_tokens: 50, stop: ["<|im_end|>"] }
        }),
      });

      if (!response.ok) throw new Error(`LLM_HTTP_${response.status}`);
      const result = await response.json();
      const aiText = result[0]?.generated_text?.split('assistant\n')[1] || "Silence, human.";
      speakWithIndicMio(aiText.trim());
    } catch (err) {
      console.error("[LLM] Fallback triggered", err);
      speakWithIndicMio("I grow tired of this silence. Explain yourself.");
    }
  };

  // TTS Logic
  const speakWithIndicMio = async (text) => {
    setIsProcessing(true);
    console.log(`[TTS] Synthesizing: "${text}"`);
    try {
      const response = await fetch(INDIC_MIO_API, {
        headers: HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({ inputs: text }),
      });

      if (!response.ok) throw new Error(`TTS_HTTP_${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      ttsAudioRef.current.src = url;
      ttsAudioRef.current.play();
      setTranscript(`[LORD POKE]: ${text}`);
    } catch (err) {
      console.error("[TTS] Browser Fallback", err);
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
      setTranscript(`[LORD POKE (Fallback)]: ${text}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Voice activity detection
  const startListening = (stream) => {
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const analyzer = audioContextRef.current.createAnalyser();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(analyzer);
    
    let silenceStart = Date.now();
    const buffer = new Uint8Array(analyzer.frequencyBinCount);
    
    const checkVolume = () => {
        if (callRef.current && callRef.current.open) {
            analyzer.getByteFrequencyData(buffer);
            const volume = buffer.reduce((a, b) => a + b) / buffer.length;
            if (volume > 10) {
                silenceStart = Date.now();
            } else if (Date.now() - silenceStart > 1500 && !isProcessing) {
                silenceStart = Date.now(); 
                if (isLordPoke) {
                    console.log("[STT] Silence detected, triggering LLM.");
                    getLordPokeResponse("Tell me something interesting.");
                }
            }
            requestAnimationFrame(checkVolume);
        }
    };
    checkVolume();
  };

  const setupCall = (call) => {
    callRef.current = call;
    
    // Explicitly handle peer state to ensure tones stop
    call.on('stream', (remoteStream) => {
      console.log("[PEER] Stream received, transitioning to ACTIVE.");
      stopTone(); // Ensure tone stops when actual audio data arrives
      
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(e => console.error("[AUDIO] Play failed:", e));
      }
      setCallState('ACTIVE');
      if (isLordPoke) {
          startListening(remoteStream);
          speakWithIndicMio("Uplink synchronized. State your purpose, human.");
      }
    });

    call.on('close', () => {
      console.log("[PEER] Connection closed.");
      endCall();
    });
    call.on('error', (err) => {
      console.error("[PEER] Connection error:", err);
      endCall();
    });
  };

  const startCall = async () => {
    if (!targetId) return;
    audioEngine.init();
    setCallState('DIALING');
    stopTone();
    audioCleanupRef.current = audioEngine.playDialTone() || null;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      const call = peerRef.current.call(targetId, stream);
      setupCall(call);
    } catch (err) {
      console.error("[MEDIA] Mic access denied:", err);
      stopTone();
      setCallState('IDLE');
    }
  };

  const answerCall = async () => {
    console.log("[UI] Answering call...");
    stopTone();
    audioEngine.init();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      callRef.current.answer(stream);
      setupCall(callRef.current);
    } catch (err) {
      console.error("[MEDIA] Answer failed:", err);
      setCallState('IDLE');
    }
  };

  const endCall = () => {
    stopTone();
    callRef.current?.close();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    setCallState('ENDED');
    setTimeout(() => setCallState('IDLE'), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black text-white font-mono p-4 flex flex-col touch-none border-[12px] border-black">
      <div className="flex justify-between items-start mb-4">
        <div className="border border-[#D4AF37] p-3 bg-black/80">
          <h2 className="text-[#D4AF37] font-black text-lg mb-1 leading-none tracking-tighter">LORD POKE VOICE</h2>
          <div className="text-[9px] space-y-1 opacity-80">
            <div className="flex items-center gap-1"><SignalHigh size={10} /> LINK: {peerId ? 'STABLE' : 'ESTABLISHING...'}</div>
            <div className="flex items-center gap-1"><ShieldCheck size={10} /> SEC: AES-P2P</div>
            <div className="flex items-center gap-1"><Cpu size={10} /> CORE: {isProcessing ? 'BUSY' : 'IDLE'}</div>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className="bg-red-600 text-black font-black px-2 py-1 text-[10px] mb-2 uppercase">
            {isLordPoke ? 'STATION_NODE' : 'ACCESS_CLIENT'}
          </div>
          <div className="text-[9px] text-[#D4AF37] border border-[#D4AF37] px-2 py-1 uppercase font-bold">
            STATUS: {callState}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center gap-6 relative overflow-hidden">
        {callState === 'IDLE' ? (
           <div className="w-full max-w-sm space-y-6 z-10">
           <div className="border-2 border-white p-4 bg-black/90">
             <div className="text-[10px] text-[#D4AF37] uppercase mb-2 font-bold tracking-widest">Node ID</div>
             <div className="text-sm break-all font-bold text-white">{peerId || '...'}</div>
           </div>
           <div className="border-2 border-white p-4 bg-black/90">
             <input type="text" value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="TARGET_NODE_ID" className="w-full bg-transparent border-b border-[#D4AF37] py-2 focus:outline-none text-sm" />
           </div>
           <button onClick={startCall} className="w-full bg-[#D4AF37] text-black py-5 font-black flex items-center justify-center gap-3 active:scale-95 transition-all">
             <Radio size={24} /> INITIATE_UPLINK
           </button>
         </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-6 z-10 p-4">
             <div className={`w-32 h-32 rounded-full border-4 border-[#D4AF37] flex items-center justify-center transition-all duration-500 ${isProcessing ? 'scale-110 shadow-[0_0_50px_#D4AF37]' : ''}`}>
                <Activity size={48} className={callState === 'ACTIVE' ? 'text-[#D4AF37] animate-pulse' : 'text-white'} />
             </div>
             <div className="w-full bg-white/5 border border-[#D4AF37]/30 p-4 min-h-[120px] flex flex-col">
                <div className="text-[9px] text-[#D4AF37] mb-2 uppercase tracking-widest flex items-center gap-2">
                  <MessageSquare size={10} /> Neural Link Stream
                </div>
                <div className="text-xs text-white/90 leading-relaxed italic overflow-y-auto">
                  {transcript || "Synchronizing brainwaves..."}
                </div>
             </div>
             <div className="grid grid-cols-2 gap-4 w-full max-w-xs mt-auto">
                <button onClick={endCall} className="bg-red-600 text-white py-4 font-black text-xs uppercase flex items-center justify-center gap-2">
                  <PhoneOff size={16} /> Terminate
                </button>
                {callState === 'INCOMING' && (
                  <button onClick={answerCall} className="bg-[#D4AF37] text-black py-4 font-black text-xs uppercase flex items-center justify-center gap-2">
                    <Zap size={16} /> Answer
                  </button>
                )}
             </div>
          </div>
        )}
      </div>
      <audio ref={remoteAudioRef} autoPlay />
    </div>
  );
}
