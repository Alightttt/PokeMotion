import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, Pause, Square, Download, Plus, Trash2, 
  Layers, Settings, Video, Image as ImageIcon, Type, 
  Move, Scissors, ChevronRight, ChevronDown, Monitor,
  Smartphone, Maximize, Upload
} from 'lucide-react';
import gsap from 'gsap';
import { v4 as uuidv4 } from 'uuid';

// --- RGK Brutalist Constants ---
const CLAW_RED = '#e63946';
const BRUTAL_WHITE = '#f2f2f2';
const BRUTAL_BLACK = '#000000';

const ASPECT_RATIOS = {
  LANDSCAPE: { label: '1080p (16:9)', width: 1920, height: 1080 },
  VERTICAL: { label: 'Shorts (9:16)', width: 1080, height: 1920 },
  SQUARE: { label: 'Post (1:1)', width: 1080, height: 1080 }
};

const FONTS = ['JetBrains Mono', 'Playfair Display', 'Poppins', 'Inter'];

const ANIMATION_PRESETS = {
  NONE: 'None',
  KINETIC_OVERSHOOT: 'RGK Snap (Overshoot)',
  KEN_BURNS_DRIFT: 'Sub-Pixel Drift (Ken Burns)',
  STAGGER_REVEAL: 'Stagger Reveal',
  GLITCH_FLICKER: 'Glitch Flicker'
};

export default function App() {
  const [layers, setLayers] = useState([
    {
      id: 'dm-to-order',
      type: 'text',
      name: 'DM TO ORDER',
      start: 9,
      duration: 1,
      visible: true,
      locked: false,
      props: {
        x: 1920 / 2,
        y: 1080 - 150,
        scale: 1,
        opacity: 1,
        rotation: 0,
        text: 'DM TO ORDER',
        fontSize: 80,
        fontFamily: 'JetBrains Mono',
        color: CLAW_RED,
        textAlign: 'center',
        animation: 'KINETIC_OVERSHOOT'
      }
    },
    {
      id: 'realism-text',
      type: 'text',
      name: 'REALISM.',
      start: 6.5,
      duration: 2.5,
      visible: true,
      locked: false,
      props: {
        x: 1920 / 2,
        y: 1080 / 2,
        scale: 1,
        opacity: 1,
        rotation: 0,
        text: 'REALISM.',
        fontSize: 160,
        fontFamily: 'JetBrains Mono',
        color: BRUTAL_WHITE,
        textAlign: 'center',
        animation: 'STAGGER_REVEAL'
      }
    },
    {
      id: 'realism-bg',
      type: 'image',
      name: 'Couple Sketch',
      start: 6.5,
      duration: 3.5,
      visible: true,
      locked: false,
      props: {
        x: 1920 / 2,
        y: 1080 / 2,
        scale: 1.1,
        opacity: 0.6,
        rotation: 0,
        src: '/couple_sketch.jpg',
        width: 1000,
        height: 1000,
        animation: 'KEN_BURNS_DRIFT'
      }
    },
    {
      id: 'par-maine',
      type: 'text',
      name: 'par maine isse...',
      start: 5,
      duration: 1.5,
      visible: true,
      locked: false,
      props: {
        x: 1920 / 2,
        y: 1080 / 2,
        scale: 1,
        opacity: 1,
        rotation: 0,
        text: 'par maine isse...',
        fontSize: 100,
        fontFamily: 'Playfair Display',
        color: BRUTAL_WHITE,
        textAlign: 'center',
        animation: 'KEN_BURNS_DRIFT'
      }
    },
    {
      id: 'toot-gayi',
      type: 'text',
      name: 'TOOT GAYI.',
      start: 3,
      duration: 2,
      visible: true,
      locked: false,
      props: {
        x: 1920 / 2,
        y: 1080 / 2,
        scale: 1,
        opacity: 1,
        rotation: 0,
        text: 'TOOT GAYI.',
        fontSize: 140,
        fontFamily: 'JetBrains Mono',
        color: CLAW_RED,
        textAlign: 'center',
        animation: 'GLITCH_FLICKER'
      }
    },
    {
      id: 'trash-tools',
      type: 'text',
      name: 'TRASH TOOLS',
      start: 0,
      duration: 3,
      visible: true,
      locked: false,
      props: {
        x: 1920 / 2,
        y: 1080 / 2,
        scale: 1,
        opacity: 1,
        rotation: 0,
        text: 'TRASH TOOLS',
        fontSize: 180,
        fontFamily: 'JetBrains Mono',
        color: BRUTAL_WHITE,
        textAlign: 'center',
        animation: 'KINETIC_OVERSHOOT'
      }
    }
  ]);

  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(10);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resolution, setResolution] = useState(ASPECT_RATIOS.LANDSCAPE);
  const [fps, setFps] = useState(30);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const canvasRef = useRef(null);
  const lastTimeRef = useRef(0);
  const animationFrameRef = useRef(null);
  const assetsRef = useRef({});

  const updateLayer = (id, updates) => setLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  const updateLayerProps = (id, propUpdates) => setLayers(prev => prev.map(l => l.id === id ? { ...l, props: { ...l.props, ...propUpdates } } : l));
  const deleteLayer = (id) => { setLayers(prev => prev.filter(l => l.id !== id)); if (selectedLayerId === id) setSelectedLayerId(null); };

  const drawFrame = useCallback((ctx, time) => {
    const { width, height } = resolution;
    ctx.fillStyle = BRUTAL_BLACK;
    ctx.fillRect(0, 0, width, height);

    const activeLayers = [...layers].reverse().filter(layer => 
      layer.visible && time >= layer.start && time <= (layer.start + layer.duration)
    );

    activeLayers.forEach(layer => {
      ctx.save();
      const { x, y, scale, opacity, rotation } = layer.props;
      const progress = (time - layer.start) / layer.duration;

      ctx.globalAlpha = opacity;
      ctx.translate(x, y);
      ctx.rotate((rotation * Math.PI) / 180);

      // --- Animation Engine ---
      let animScale = scale;
      let animX = 0, animY = 0, animAlpha = 1;

      if (layer.props.animation === ANIMATION_PRESETS.KINETIC_OVERSHOOT) {
        // Elastic overshoot logic
        const p = progress * 1.5;
        animScale = scale * (p < 1 ? Math.sin(p * Math.PI * 0.5) * 1.1 : 1);
      } else if (layer.props.animation === ANIMATION_PRESETS.KEN_BURNS_DRIFT) {
        animScale = scale * (1 + progress * 0.1);
        animX = Math.sin(progress * Math.PI) * 20;
      } else if (layer.props.animation === ANIMATION_PRESETS.GLITCH_FLICKER) {
        animAlpha = Math.random() > 0.85 ? 0 : 1;
      } else if (layer.props.animation === ANIMATION_PRESETS.STAGGER_REVEAL) {
        animAlpha = progress < 0.2 ? 0 : 1;
        animY = progress < 0.3 ? 20 * (1 - progress/0.3) : 0;
      }

      ctx.scale(animScale, animScale);
      ctx.translate(animX, animY);
      ctx.globalAlpha *= animAlpha;

      if (layer.type === 'text') {
        ctx.font = `${layer.props.fontSize}px "${layer.props.fontFamily}"`;
        ctx.fillStyle = layer.props.color;
        ctx.textAlign = layer.props.textAlign;
        ctx.textBaseline = 'middle';
        ctx.fillText(layer.props.text, 0, 0);
      } else if (layer.type === 'image') {
        const imgSrc = layer.props.src;
        if (!assetsRef.current[imgSrc]) {
            const img = new Image();
            img.src = imgSrc;
            img.onload = () => { assetsRef.current[imgSrc] = img; };
        }
        const img = assetsRef.current[imgSrc];
        if (img) {
          ctx.drawImage(img, -layer.props.width/2, -layer.props.height/2, layer.props.width, layer.props.height);
        }
      }
      ctx.restore();
    });

    // Brutalist Frame Overlay
    ctx.strokeStyle = CLAW_RED;
    ctx.lineWidth = 20;
    ctx.strokeRect(0, 0, width, height);
  }, [layers, resolution]);

  useEffect(() => {
    if (isPlaying) {
      const animate = (time) => {
        const delta = (time - lastTimeRef.current) / 1000;
        lastTimeRef.current = time;
        setCurrentTime(prev => (prev + delta >= duration ? 0 : prev + delta));
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      lastTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(animationFrameRef.current);
    }
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [isPlaying, duration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = resolution.width * dpr;
    canvas.height = resolution.height * dpr;
    ctx.scale(dpr, dpr);
    drawFrame(ctx, currentTime);
  }, [currentTime, resolution, drawFrame]);

  return (
    <div className="flex flex-col h-screen w-screen bg-brutal-black text-brutal-white font-mono overflow-hidden">
      <header className="h-14 border-b border-brutal-white/20 flex items-center justify-between px-6 bg-brutal-black z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-claw-red flex items-center justify-center font-bold text-black rotate-12">RGK</div>
          <span className="font-bold tracking-tighter text-xl italic uppercase">KINETIC_BRUTALISM</span>
        </div>
        <button className="bg-claw-red text-black px-4 py-1 font-bold shadow-[4px_4px_0px_#f2f2f2]">RENDER_V1</button>
      </header>
      <main className="flex-1 flex overflow-hidden">
        <section className="flex-1 flex flex-col bg-[#0a0a0a] relative">
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="relative border-4 border-brutal-white shadow-[30px_30px_0px_#e63946]" 
                 style={{ width: '100%', maxWidth: '900px', aspectRatio: '16/9' }}>
              <canvas ref={canvasRef} className="w-full h-full" />
            </div>
          </div>
          <div className="h-40 border-t border-brutal-white/20 p-4">
             <div className="flex gap-4 items-center mb-4">
               <button onClick={() => setIsPlaying(!isPlaying)} className="bg-brutal-white text-black px-4 py-1 font-bold">{isPlaying ? 'PAUSE' : 'PLAY'}</button>
               <span className="text-claw-red font-bold">{currentTime.toFixed(2)}s</span>
             </div>
             <div className="w-full h-2 bg-brutal-white/10 relative">
               <div className="h-full bg-claw-red" style={{ width: `${(currentTime/duration)*100}%` }} />
             </div>
          </div>
        </section>
        <aside className="w-80 border-l border-brutal-white/20 bg-brutal-black p-6">
           <h2 className="text-xs font-bold uppercase tracking-widest text-claw-red mb-6">Layer_Timeline</h2>
           <div className="flex flex-col gap-2">
             {layers.map(l => (
               <div key={l.id} className="p-2 border border-brutal-white/10 text-[10px] hover:border-claw-red cursor-pointer">
                 {l.name.toUpperCase()} [{l.start}s - {l.duration}s]
               </div>
             ))}
           </div>
        </aside>
      </main>
    </div>
  );
}
