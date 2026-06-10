import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, Pause, Volume2, VolumeX, Maximize, 
  Layers, Zap, Monitor, Smartphone, Download
} from 'lucide-react';

// --- RGK / Sawyer Hood Luxury Brutalist System ---
const COLORS = {
  CLAW_RED: '#e63946',
  OFF_WHITE: '#f2f2f2',
  DEEP_BLACK: '#050505',
  PAPER_GRAIN: 'rgba(242, 242, 242, 0.05)'
};

const SFX_URLS = {
  SHUTTER: 'https://www.soundjay.com/mechanical/camera-shutter-click-01.mp3',
  WHOOSH: 'https://www.soundjay.com/free-swish-sound-effects/swish-1.mp3',
  SUB_HIT: 'https://www.soundjay.com/button/beep-07.mp3', // Placeholder for heavy hit
  GLITCH: 'https://www.soundjay.com/communication/static-noise-01.mp3'
};

const MEDIA_URL = "https://storage.googleapis.com/interaction-media-bucket/47f84109-d17a-4375-8fc8-f55e778ed5d8/5fb0cc73-8d4f-5749-bfab-70c1be3936bf?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=vercel%40theta-eon-430220-u6.iam.gserviceaccount.com%2F20260610%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Date=20260610T080517Z&X-Goog-Expires=60&X-Goog-SignedHeaders=host&X-Goog-Signature=9cb47010317ea238ee8ab55140963cd9ff9b8d365cdfa5ceed1349ca8956016c94ccb9e4f38f76dfeae766ad61ff1eb420ebc2b57a0c6a507377422e29b994a3fd9d6278b3a5eee22207cec1c9aed5c109242afd70791d9d432f6361e5f8245eab65850f026b72071dbe770f04cbe578a6a77bb8dc1d552ae1bff70e16201ac62fdcb7cf0b11910f45b7e900c66db418a6d8401252156e4c6b2628a17a2068f5a00dd5150d7f82ba77367ca24775f1d3d43341fe7bb960c0709a47afee65ebf917c5656fa55451954ead11f0fe385d54c7bfed16384f923f2e3e1be683f3745e851a6185ae607c05d1a5437bceced785efd68f0234c08c2f70a29622125bcde1";

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const duration = 10;
  const canvasRef = useRef(null);
  const assetsRef = useRef({});
  const audioRefs = useRef({});
  const lastTimeRef = useRef(0);
  const frameRef = useRef();

  const layers = [
    { id: 'bg-image', type: 'image', start: 0, end: 10, src: MEDIA_URL },
    { id: 't1', type: 'text', start: 0.5, end: 3, text: 'TRASH TOOLS.', font: '800 160px JetBrains Mono', color: COLORS.OFF_WHITE, sfx: 'SHUTTER' },
    { id: 't2', type: 'text', start: 3.2, end: 5, text: 'TOOT GAYI.', font: 'italic 120px Playfair Display', color: COLORS.CLAW_RED, sfx: 'WHOOSH' },
    { id: 't3', type: 'text', start: 5.5, end: 8, text: 'ELITE REALISM.', font: '800 140px JetBrains Mono', color: COLORS.OFF_WHITE, sfx: 'SUB_HIT' },
    { id: 't4', type: 'text', start: 8.5, end: 10, text: 'DM TO ORDER', font: '600 80px JetBrains Mono', color: COLORS.CLAW_RED, sfx: 'SHUTTER' }
  ];

  const playSFX = useCallback((key) => {
    if (isMuted || !SFX_URLS[key]) return;
    if (!audioRefs.current[key]) {
      audioRefs.current[key] = new Audio(SFX_URLS[key]);
    }
    const audio = audioRefs.current[key];
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, [isMuted]);

  const draw = useCallback((ctx, time) => {
    const { width, height } = ctx.canvas;
    ctx.clearRect(0, 0, width, height);

    // 1. Cinematic Background (Deep Black)
    ctx.fillStyle = COLORS.DEEP_BLACK;
    ctx.fillRect(0, 0, width, height);

    // 2. Render Image Layer (Elite Ken Burns)
    const imgLayer = layers.find(l => l.type === 'image');
    if (!assetsRef.current[imgLayer.src]) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imgLayer.src;
      img.onload = () => { assetsRef.current[imgLayer.src] = img; };
    }
    const img = assetsRef.current[imgLayer.src];
    if (img) {
      ctx.save();
      const progress = time / duration;
      const scale = 1.1 + progress * 0.15; // Slow luxury zoom
      const driftX = Math.sin(progress * Math.PI) * 50;
      ctx.translate(width / 2 + driftX, height / 2);
      ctx.scale(scale, scale);
      ctx.globalAlpha = 0.7;
      ctx.shadowBlur = 100;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.drawImage(img, -width / 2, -height / 2, width, height);
      ctx.restore();
    }

    // 3. Film Grain / Texture Overlay
    ctx.fillStyle = COLORS.PAPER_GRAIN;
    for (let i = 0; i < 5; i++) {
        ctx.fillRect(Math.random() * width, Math.random() * height, 2, 2);
    }

    // 4. Text Layers with Kinetic Animations
    layers.filter(l => l.type === 'text' && time >= l.start && time <= l.end).forEach(l => {
      ctx.save();
      const layerProgress = (time - l.start) / (l.end - l.start);
      const entryProgress = Math.min((time - l.start) / 0.4, 1); // 400ms entry
      
      // Kinetic Shake / Jitter on entry
      const shake = entryProgress < 1 ? (Math.random() - 0.5) * 20 : 0;
      
      ctx.translate(width / 2 + shake, height / 2 + shake);
      
      // Scale & Alpha Easing
      const easeScale = entryProgress === 1 ? 1 : 1.2 - (entryProgress * 0.2);
      ctx.scale(easeScale, easeScale);
      ctx.globalAlpha = entryProgress;

      // Premium Styling
      ctx.font = l.font;
      ctx.fillStyle = l.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 10;
      
      // Glitch effect randomly
      if (Math.random() > 0.97) {
          ctx.translate(10, 0);
          ctx.fillStyle = COLORS.CLAW_RED;
          ctx.fillText(l.text, 0, 0);
      }
      
      ctx.fillText(l.text, 0, 0);
      ctx.restore();
    });

    // 5. Brutalist UI Border
    ctx.strokeStyle = COLORS.CLAW_RED;
    ctx.lineWidth = 15;
    ctx.strokeRect(0, 0, width, height);
    
    // Scanline Effect
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(0, (time * 500) % height, width, 2);

  }, [layers]);

  useEffect(() => {
    const animate = (now) => {
      if (!isPlaying) return;
      const delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      
      setCurrentTime(prev => {
        const next = prev + delta;
        // SFX Triggering Logic
        layers.forEach(l => {
            if (l.sfx && prev < l.start && next >= l.start) {
                playSFX(l.sfx);
            }
        });
        return next >= duration ? 0 : next;
      });
      frameRef.current = requestAnimationFrame(animate);
    };

    if (isPlaying) {
      lastTimeRef.current = performance.now();
      frameRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(frameRef.current);
  }, [isPlaying, playSFX]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 1920;
    canvas.height = 1080;
    draw(ctx, currentTime);
  }, [currentTime, draw]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#050505] text-[#f2f2f2] font-mono overflow-hidden">
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-8 bg-black/50 backdrop-blur-xl z-50">
        <div className="flex items-center gap-4">
          <div className="bg-[#e63946] px-2 py-1 text-black font-black text-xl skew-x-12">RGK</div>
          <span className="text-sm tracking-[0.3em] font-bold opacity-50 uppercase">Motion_Studio_v2</span>
        </div>
        <div className="flex gap-4">
           <button onClick={() => setIsMuted(!isMuted)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} className="text-[#e63946]" />}
           </button>
           <button className="bg-white text-black px-6 py-1 font-bold text-xs hover:bg-[#e63946] hover:text-white transition-all">EXPORT_MASTER</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-8 relative">
        <div className="relative group max-w-5xl w-full aspect-video border-[1px] border-white/20 shadow-2xl overflow-hidden bg-black">
          <canvas ref={canvasRef} className="w-full h-full object-contain" />
          
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
             <button onClick={() => setIsPlaying(!isPlaying)} className="w-20 h-20 bg-[#e63946] rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-xl">
                {isPlaying ? <Pause size={40} fill="white" /> : <Play size={40} fill="white" className="ml-2" />}
             </button>
          </div>

          {isMuted && (
              <div className="absolute top-8 right-8 bg-black/80 px-4 py-2 border border-[#e63946] animate-pulse">
                <button onClick={() => { setIsMuted(false); setIsPlaying(true); }} className="text-[10px] font-bold text-[#e63946]">UNMUTE FOR CINEMATIC SFX</button>
              </div>
          )}
        </div>

        <div className="mt-12 w-full max-w-5xl">
            <div className="flex justify-between items-end mb-2">
                <div className="text-[10px] font-bold opacity-30">TIMELINE_POS: {currentTime.toFixed(3)}s</div>
                <div className="text-[10px] font-bold text-[#e63946]">0:10.000</div>
            </div>
            <div className="h-1 w-full bg-white/5 relative cursor-pointer" onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setCurrentTime(((e.clientX - rect.left) / rect.width) * duration);
            }}>
                <div className="h-full bg-[#e63946] shadow-[0_0_15px_#e63946]" style={{ width: `${(currentTime/duration)*100}%` }} />
            </div>
            
            <div className="flex gap-1 mt-4 overflow-x-auto py-2">
                {layers.map(l => (
                    <div key={l.id} className="min-w-[120px] h-10 border border-white/10 bg-white/5 p-2 flex flex-col justify-center">
                        <span className="text-[8px] opacity-40 block">{l.type.toUpperCase()}</span>
                        <span className="text-[9px] font-bold truncate">{l.text || 'MEDIA_ASSET'}</span>
                    </div>
                ))}
            </div>
        </div>
      </main>

      <footer className="h-10 border-t border-white/5 flex items-center justify-between px-8 text-[9px] opacity-30 font-bold">
        <span>RENDER_ENGINE: CANVAS_2D_ELITE</span>
        <span>FPS: 60.00</span>
        <span>STATUS: READY</span>
      </footer>
    </div>
  );
}
