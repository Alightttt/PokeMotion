// v3.0.1-hotfix - robust media recorder fallbacks
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, Pause, Volume2, VolumeX, Download, Loader2, Zap, Smartphone, Monitor,
  Image as ImageIcon, Type, Sliders, Palette, ChevronRight, ChevronLeft, Upload, Save, Trash2
} from 'lucide-react';

const COLORS = {
  CLAW_RED: '#e63946',
  OFF_WHITE: '#f2f2f2',
  DEEP_BLACK: '#050505',
};

const SFX_URLS = {
  SHUTTER: 'https://www.soundjay.com/mechanical/camera-shutter-click-01.mp3',
  WHOOSH: 'https://www.soundjay.com/free-swish-sound-effects/swish-1.mp3',
  SUB_HIT: 'https://www.soundjay.com/button/beep-07.mp3',
};

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1513364238782-601d933391d4?auto=format&fit=crop&w=1920&q=80";

const STYLE_PRESETS = {
  'Luxury Charcoal': {
    bgOpacity: 0.6,
    filter: 'grayscale(100%) brightness(0.8)',
    fontFamily: '"JetBrains Mono"',
    grain: 0.1,
    accent: '#e63946'
  },
  'Fight Club Brutalist': {
    bgOpacity: 0.4,
    filter: 'contrast(150%) hue-rotate(90deg)',
    fontFamily: '"Playfair Display"',
    grain: 0.3,
    accent: '#f2f2f2'
  },
  'Ken Burns Cinema': {
    bgOpacity: 0.9,
    filter: 'sepia(20%) brightness(1.1)',
    fontFamily: '"Inter"',
    grain: 0.05,
    accent: '#ffcc00'
  }
};

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  
  // Customization States
  const [layers, setLayers] = useState([
    { id: 'bg', type: 'image', start: 0, end: 10, src: FALLBACK_IMAGE },
    { id: 't1', type: 'text', start: 0.5, end: 3, text: 'TRASH TOOLS.', font: '800 140px "JetBrains Mono"', color: COLORS.OFF_WHITE, sfx: 'SHUTTER' },
    { id: 't2', type: 'text', start: 3.2, end: 5.5, text: 'TOOT GAYI.', font: 'italic 120px "Playfair Display"', color: COLORS.CLAW_RED, sfx: 'WHOOSH' },
    { id: 't3', type: 'text', start: 6, end: 8.5, text: 'ELITE REALISM.', font: '800 130px "JetBrains Mono"', color: COLORS.OFF_WHITE, sfx: 'SUB_HIT' },
    { id: 't4', type: 'text', start: 9, end: 10, text: 'DM TO ORDER', font: '700 70px "JetBrains Mono"', color: COLORS.CLAW_RED, sfx: 'SHUTTER' }
  ]);
  const [selectedLayerId, setSelectedLayerId] = useState('t1');
  const [activePreset, setActivePreset] = useState('Luxury Charcoal');
  const [globalSettings, setGlobalSettings] = useState({
    panSpeed: 0.1,
    zoomFactor: 1.1,
    crtOverlay: true,
    grainIntensity: 0.05
  });

  const duration = 10;
  const canvasRef = useRef(null);
  const assetsRef = useRef({});
  const audioRefs = useRef({});
  const lastTimeRef = useRef(0);
  const frameRef = useRef();

  const playSFX = useCallback((key) => {
    if (isMuted || !SFX_URLS[key]) return;
    if (!audioRefs.current[key]) audioRefs.current[key] = new Audio(SFX_URLS[key]);
    const audio = audioRefs.current[key];
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }, [isMuted]);

  const draw = useCallback((ctx, time) => {
    const { width, height } = ctx.canvas;
    const preset = STYLE_PRESETS[activePreset];
    
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.DEEP_BLACK;
    ctx.fillRect(0, 0, width, height);

    // Background Image
    const imgLayer = layers.find(l => l.type === 'image');
    if (imgLayer && !assetsRef.current[imgLayer.src]) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imgLayer.src;
      img.onload = () => { assetsRef.current[imgLayer.src] = img; };
    }

    const img = assetsRef.current[imgLayer?.src];
    if (img && img !== 'FAILED') {
      ctx.save();
      const p = time / duration;
      const scale = globalSettings.zoomFactor + (p * globalSettings.panSpeed);
      ctx.translate(width / 2, height / 2);
      ctx.scale(scale, scale);
      ctx.globalAlpha = preset.bgOpacity;
      ctx.filter = preset.filter;
      ctx.drawImage(img, -width / 2, -height / 2, width, height);
      ctx.restore();
    }

    // Text Layers
    layers.filter(l => l.type === 'text' && time >= l.start && time <= l.end).forEach(l => {
      ctx.save();
      const p = (time - l.start) / 0.5; // 500ms reveal
      const alpha = Math.min(p, 1);
      const scale = 1.2 - (Math.min(p, 1) * 0.2);
      
      ctx.translate(width / 2, height / 2);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      ctx.font = l.font;
      ctx.fillStyle = l.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 30;
      
      if (alpha < 1) ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
      
      ctx.fillText(l.text, 0, 0);
      ctx.restore();
    });

    // Grain & Overlays
    if (globalSettings.grainIntensity > 0) {
      ctx.save();
      ctx.globalAlpha = globalSettings.grainIntensity;
      for (let i = 0; i < 100; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
        ctx.fillRect(Math.random() * width, Math.random() * height, 2, 2);
      }
      ctx.restore();
    }

    // Border
    ctx.strokeStyle = preset.accent;
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, width, height);
  }, [layers, activePreset, globalSettings]);

  useEffect(() => {
    const animate = (now) => {
      if (!isPlaying) return;
      const delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      setCurrentTime(prev => {
        const next = prev + delta;
        layers.forEach(l => { if (l.sfx && prev < l.start && next >= l.start) playSFX(l.sfx); });
        return next >= duration ? 0 : next;
      });
      frameRef.current = requestAnimationFrame(animate);
    };
    if (isPlaying) {
      lastTimeRef.current = performance.now();
      frameRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(frameRef.current);
  }, [isPlaying, playSFX, layers]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 1920;
    canvas.height = 1080;
    draw(ctx, currentTime);
  }, [currentTime, draw]);

  const handleExport = async () => {
    setIsExporting(true);
    setIsPlaying(false);
    setCurrentTime(0);
    
    try {
      const stream = canvasRef.current.captureStream(60);
      let options = { mimeType: 'video/webm;codecs=vp9' };
      
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn('VP9 not supported, falling back to webm');
        options = { mimeType: 'video/webm' };
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn('WebM not supported, falling back to mp4');
        options = { mimeType: 'video/mp4' };
      }

      const recorder = new MediaRecorder(stream, options);
      const chunks = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: options.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `RGK_EXPORT_${Date.now()}.${options.mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
        a.click();
        setIsExporting(false);
        setExportProgress(0);
      };
      
      recorder.start();
      setIsPlaying(true);
      
      const checkProgress = setInterval(() => {
        setExportProgress((currentTime / duration) * 100);
        if (currentTime >= duration - 0.1) {
          clearInterval(checkProgress);
          recorder.stop();
          setIsPlaying(false);
        }
      }, 100);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed: Your browser may not support canvas recording.');
      setIsExporting(false);
    }
  };

  const updateLayer = (id, fields) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, ...fields } : l));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      updateLayer('bg', { src: url });
    }
  };

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  return (
    <div className="min-h-screen bg-[#050505] text-white font-mono flex flex-col md:flex-row overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="w-full md:w-80 border-r border-white/10 bg-black/40 backdrop-blur-xl z-50 flex flex-col h-screen overflow-y-auto">
        <div className="p-6 border-b border-white/10 flex items-center gap-3">
          <div className="bg-[#e63946] px-3 py-1 text-black font-black italic">RGK</div>
          <span className="text-[10px] tracking-widest uppercase opacity-40">Editor_V3.0</span>
        </div>

        <div className="p-4 space-y-8">
          {/* Presets */}
          <section>
            <h3 className="text-[10px] uppercase tracking-tighter opacity-40 mb-4 flex items-center gap-2">
              <Palette size={12} /> Visual_Presets
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {Object.keys(STYLE_PRESETS).map(preset => (
                <button 
                  key={preset}
                  onClick={() => setActivePreset(preset)}
                  className={`text-left p-3 text-[11px] border ${activePreset === preset ? 'border-[#e63946] bg-[#e63946]/10 text-[#e63946]' : 'border-white/5 hover:bg-white/5'}`}
                >
                  {preset.toUpperCase()}
                </button>
              ))}
            </div>
          </section>

          {/* Layers List */}
          <section>
            <h3 className="text-[10px] uppercase tracking-tighter opacity-40 mb-4 flex items-center gap-2">
              <Type size={12} /> Text_Layers
            </h3>
            <div className="space-y-2">
              {layers.filter(l => l.type === 'text').map(l => (
                <button 
                  key={l.id}
                  onClick={() => setSelectedLayerId(l.id)}
                  className={`w-full text-left p-3 text-[11px] flex items-center justify-between border ${selectedLayerId === l.id ? 'border-white/40 bg-white/5' : 'border-white/5'}`}
                >
                  <span className="truncate">{l.text || 'UNTITLED'}</span>
                  {selectedLayerId === l.id && <ChevronRight size={14} />}
                </button>
              ))}
            </div>
          </section>

          {/* Global Settings */}
          <section>
            <h3 className="text-[10px] uppercase tracking-tighter opacity-40 mb-4 flex items-center gap-2">
              <Sliders size={12} /> Engine_Settings
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] mb-2"><span>PAN_SPEED</span><span>{globalSettings.panSpeed}</span></div>
                <input type="range" min="0" max="0.5" step="0.01" value={globalSettings.panSpeed} onChange={(e) => setGlobalSettings({...globalSettings, panSpeed: parseFloat(e.target.value)})} className="w-full accent-[#e63946]" />
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-2"><span>GRAIN_INTENSITY</span><span>{globalSettings.grainIntensity}</span></div>
                <input type="range" min="0" max="0.2" step="0.01" value={globalSettings.grainIntensity} onChange={(e) => setGlobalSettings({...globalSettings, grainIntensity: parseFloat(e.target.value)})} className="w-full accent-[#e63946]" />
              </div>
            </div>
          </section>
        </div>
      </aside>

      {/* Main Preview Area */}
      <main className="flex-1 flex flex-col bg-[#080808] relative">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 z-40">
          <div className="flex gap-4">
            <button onClick={() => setIsMuted(!isMuted)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} className="text-[#e63946]" />}
            </button>
          </div>
          <button 
            disabled={isExporting}
            onClick={handleExport}
            className="bg-[#e63946] text-black px-6 py-1 font-bold text-[11px] hover:bg-white transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            {isExporting ? `RENDERING ${Math.floor(exportProgress)}%` : 'EXPORT_MASTER_V3'}
          </button>
        </header>

        <div className="flex-1 flex items-center justify-center p-4 md:p-12">
          <div className="relative w-full max-w-4xl aspect-video bg-black shadow-2xl border border-white/10 group overflow-hidden">
             <canvas ref={canvasRef} className="w-full h-full object-contain" />
             <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
                <button onClick={() => setIsPlaying(!isPlaying)} className="w-20 h-20 bg-[#e63946] rounded-full flex items-center justify-center hover:scale-110 transition-transform">
                  {isPlaying ? <Pause fill="white" size={32} /> : <Play fill="white" size={32} className="ml-1" />}
                </button>
             </div>
          </div>
        </div>

        {/* Timeline Bar */}
        <div className="px-8 pb-8">
           <div className="w-full h-1 bg-white/5 relative cursor-pointer" onClick={(e) => {
             const rect = e.currentTarget.getBoundingClientRect();
             const p = (e.clientX - rect.left) / rect.width;
             setCurrentTime(p * duration);
           }}>
              <div className="h-full bg-[#e63946] relative" style={{ width: `${(currentTime/duration)*100}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg" />
              </div>
           </div>
           <div className="flex justify-between mt-3 text-[9px] font-bold opacity-30 uppercase tracking-[0.3em]">
              <span>{currentTime.toFixed(2)}s</span>
              <span>KINETIC_FLOW_LIVE</span>
              <span>10.00s</span>
           </div>
        </div>

        {/* Floating Inspector Panel (Mobile Friendly) */}
        {selectedLayer && (
          <div className="absolute bottom-24 right-8 w-80 bg-black/90 border border-white/10 p-5 backdrop-blur-2xl rounded-lg shadow-2xl z-50">
             <div className="flex justify-between items-center mb-6">
                <h4 className="text-[10px] font-black uppercase text-[#e63946]">Inspector // {selectedLayer.id}</h4>
                <button onClick={() => setSelectedLayerId(null)} className="opacity-40 hover:opacity-100"><ChevronLeft size={16}/></button>
             </div>
             
             <div className="space-y-4">
                {selectedLayer.type === 'text' && (
                  <>
                    <div>
                      <label className="text-[8px] opacity-40 uppercase block mb-1">Content</label>
                      <input 
                        type="text" 
                        value={selectedLayer.text}
                        onChange={(e) => updateLayer(selectedLayer.id, { text: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 px-3 py-2 text-[12px] focus:outline-none focus:border-[#e63946]"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] opacity-40 uppercase block mb-1">Color</label>
                      <div className="flex gap-2">
                        {['#f2f2f2', '#e63946', '#ffcc00', '#00ffcc'].map(c => (
                          <button 
                            key={c}
                            onClick={() => updateLayer(selectedLayer.id, { color: c })}
                            className={`w-6 h-6 rounded-full border-2 ${selectedLayer.color === c ? 'border-white' : 'border-transparent'}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="pt-4 border-t border-white/5 flex gap-2">
                  <label className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 py-2 text-[10px] cursor-pointer">
                    <Upload size={12} /> Replace_BG
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                  </label>
                </div>
             </div>
          </div>
        )}
      </main>
    </div>
  );
}
