import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, Pause, Square, Download, Plus, Trash2, 
  Layers, Settings, Video, Image as ImageIcon, Type, 
  Move, Scissors, ChevronRight, ChevronDown, Monitor,
  Smartphone, Maximize, Upload
} from 'lucide-react';
import gsap from 'gsap';
import { v4 as uuidv4 } from 'uuid';

// --- Constants ---
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
  SNAP_SPRING: 'Snap Spring',
  KINETIC_DRIFT: 'Kinetic Drift',
  GLITCH_FLICKER: 'Glitch Flicker',
  SUBPIXEL_SLIDE: 'Sub-pixel Slide'
};

// --- Main App Component ---
export default function App() {
  // State
  const [layers, setLayers] = useState([]);
  const [selectedLayerId, setSelectedLayerId] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(10); // seconds
  const [isPlaying, setIsPlaying] = useState(false);
  const [resolution, setResolution] = useState(ASPECT_RATIOS.LANDSCAPE);
  const [fps, setFps] = useState(30);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Refs
  const canvasRef = useRef(null);
  const playheadRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastTimeRef = useRef(0);
  const assetsRef = useRef({}); // Cache for loaded images/videos

  // --- Layer Management ---
  const addLayer = (type) => {
    const newLayer = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} Layer`,
      start: 0,
      duration: 5,
      visible: true,
      locked: false,
      // Default props
      props: {
        x: resolution.width / 2,
        y: resolution.height / 2,
        scale: 1,
        opacity: 1,
        rotation: 0,
        ...(type === 'text' && {
          text: 'NEW_SEQUENCE',
          fontSize: 120,
          fontFamily: 'JetBrains Mono',
          color: BRUTAL_WHITE,
          textAlign: 'center',
          animation: 'NONE'
        }),
        ...(type === 'image' && {
          assetId: null,
          width: 400,
          height: 400
        }),
        ...(type === 'color' && {
          color: CLAW_RED
        })
      }
    };
    setLayers(prev => [newLayer, ...prev]);
    setSelectedLayerId(newLayer.id);
  };

  const updateLayer = (id, updates) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const updateLayerProps = (id, propUpdates) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, props: { ...l.props, ...propUpdates } } : l));
  };

  const deleteLayer = (id) => {
    setLayers(prev => prev.filter(l => l.id !== id));
    if (selectedLayerId === id) setSelectedLayerId(null);
  };

  // --- Asset Loading ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'audio';
    
    if (type === 'image') {
      const img = new Image();
      img.onload = () => {
        const assetId = Math.random().toString(36).substr(2, 9);
        assetsRef.current[assetId] = img;
        addLayer('image');
        // Update the last added layer (we know it's at index 0 because of our addLayer logic)
        setLayers(prev => {
          const newLayers = [...prev];
          newLayers[0].props.assetId = assetId;
          newLayers[0].props.width = img.width;
          newLayers[0].props.height = img.height;
          newLayers[0].name = file.name;
          return newLayers;
        });
      };
      img.src = url;
    }
  };

  // --- Rendering Logic ---
  const drawFrame = useCallback((ctx, time) => {
    const { width, height } = resolution;
    
    // Clear background
    ctx.fillStyle = BRUTAL_BLACK;
    ctx.fillRect(0, 0, width, height);

    // Filter active layers
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
      ctx.scale(scale, scale);

      // Apply Animations
      let animX = 0, animY = 0, animAlpha = 1, animScale = 1;
      if (layer.props.animation === ANIMATION_PRESETS.SNAP_SPRING) {
        animScale = progress < 0.2 ? gsap.utils.interpolate(0, 1.2, progress / 0.2) : 
                    progress < 0.3 ? gsap.utils.interpolate(1.2, 1, (progress - 0.2) / 0.1) : 1;
      } else if (layer.props.animation === ANIMATION_PRESETS.KINETIC_DRIFT) {
        animX = Math.sin(progress * Math.PI) * 50;
      } else if (layer.props.animation === ANIMATION_PRESETS.GLITCH_FLICKER) {
        animAlpha = Math.random() > 0.9 ? 0 : 1;
      }

      ctx.scale(animScale, animScale);
      ctx.translate(animX, animY);
      ctx.globalAlpha *= animAlpha;

      // Render content
      if (layer.type === 'text') {
        ctx.font = `${layer.props.fontSize}px "${layer.props.fontFamily}"`;
        ctx.fillStyle = layer.props.color;
        ctx.textAlign = layer.props.textAlign;
        ctx.textBaseline = 'middle';
        ctx.fillText(layer.props.text, 0, 0);
      } else if (layer.type === 'image' && layer.props.assetId) {
        const img = assetsRef.current[layer.props.assetId];
        if (img) {
          ctx.drawImage(img, -layer.props.width/2, -layer.props.height/2, layer.props.width, layer.props.height);
        }
      } else if (layer.type === 'color') {
        ctx.fillStyle = layer.props.color;
        ctx.fillRect(-width/2, -height/2, width, height);
      }

      ctx.restore();
    });

    // Brutalist Overlay: Grid Scanlines
    ctx.save();
    ctx.strokeStyle = 'rgba(242, 242, 242, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
    }
    for (let j = 0; j < height; j += 40) {
      ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(width, j); ctx.stroke();
    }
    ctx.restore();

  }, [layers, resolution]);

  // --- Animation Loop ---
  useEffect(() => {
    if (isPlaying) {
      const animate = (time) => {
        const delta = (time - lastTimeRef.current) / 1000;
        lastTimeRef.current = time;
        
        setCurrentTime(prev => {
          const next = prev + delta;
          if (next >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
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
    
    // Handle 2x DPR
    const dpr = window.devicePixelRatio || 1;
    canvas.width = resolution.width * dpr;
    canvas.height = resolution.height * dpr;
    ctx.scale(dpr, dpr);
    
    drawFrame(ctx, currentTime);
  }, [currentTime, resolution, drawFrame]);

  // --- Export Logic ---
  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setIsPlaying(false);
    
    const canvas = canvasRef.current;
    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      bitsPerSecond: 5000000
    });

    const chunks = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pokemotion-${Date.now()}.webm`;
      a.click();
      setIsExporting(false);
    };

    recorder.start();

    // Frame by frame recording simulation
    let exportTime = 0;
    const step = 1 / fps;
    
    const exportInterval = setInterval(() => {
      exportTime += step;
      setCurrentTime(exportTime);
      setExportProgress((exportTime / duration) * 100);
      
      if (exportTime >= duration) {
        clearInterval(exportInterval);
        recorder.stop();
      }
    }, 1000 / fps);
  };

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  return (
    <div className="flex flex-col h-screen w-screen bg-brutal-black text-brutal-white font-mono overflow-hidden">
      {/* --- Top Bar --- */}
      <header className="h-14 border-b border-brutal-white/20 flex items-center justify-between px-6 bg-brutal-black z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-claw-red flex items-center justify-center font-bold text-black rotate-12">P</div>
          <span className="font-bold tracking-tighter text-xl italic">POKEMOTION <span className="text-claw-red">CORE</span></span>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-xs opacity-60">
            <Monitor size={14} />
            <span>{resolution.width}x{resolution.height} @ {fps}FPS</span>
          </div>
          <button 
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 bg-claw-red text-black px-4 py-1 font-bold hover:translate-x-1 hover:-translate-y-1 transition-transform shadow-[4px_4px_0px_#f2f2f2] disabled:opacity-50"
          >
            {isExporting ? `RENDERING ${Math.round(exportProgress)}%` : <><Download size={16} /> EXPORT_SEQUENCE</>}
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* --- Left Sidebar: Assets & Layers --- */}
        <aside className="w-72 border-r border-brutal-white/20 flex flex-col bg-brutal-black">
          <div className="p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-brutal-white/10 pb-2">
              <span className="text-xs font-bold uppercase tracking-widest">Assets</span>
              <label className="cursor-pointer hover:text-claw-red transition-colors">
                <Upload size={16} />
                <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,video/*" />
              </label>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => addLayer('text')} className="flex flex-col items-center gap-1 p-2 border border-brutal-white/10 hover:border-claw-red transition-colors">
                <Type size={18} />
                <span className="text-[10px]">TEXT</span>
              </button>
              <button onClick={() => addLayer('color')} className="flex flex-col items-center gap-1 p-2 border border-brutal-white/10 hover:border-claw-red transition-colors">
                <Layers size={18} />
                <span className="text-[10px]">SOLID</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
             <div className="flex items-center justify-between border-b border-brutal-white/10 pb-2 mb-4">
              <span className="text-xs font-bold uppercase tracking-widest">Sequence Layers</span>
            </div>
            <div className="flex flex-col gap-2">
              {layers.map(layer => (
                <div 
                  key={layer.id}
                  onClick={() => setSelectedLayerId(layer.id)}
                  className={`p-3 border flex items-center justify-between group cursor-pointer transition-colors ${selectedLayerId === layer.id ? 'border-claw-red bg-claw-red/10' : 'border-brutal-white/10 hover:border-brutal-white/40'}`}
                >
                  <div className="flex items-center gap-3">
                    {layer.type === 'text' ? <Type size={14} /> : layer.type === 'image' ? <ImageIcon size={14} /> : <Layers size={14} />}
                    <span className="text-xs truncate w-32">{layer.name}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }} className="opacity-0 group-hover:opacity-100 hover:text-claw-red">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* --- Center: Canvas Preview --- */}
        <section className="flex-1 flex flex-col bg-[#0a0a0a] relative">
          <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
            <div className="relative shadow-[20px_20px_0px_rgba(0,0,0,0.5)] border border-brutal-white/10 bg-black"
                 style={{ 
                   width: resolution.width > resolution.height ? '100%' : 'auto',
                   height: resolution.width > resolution.height ? 'auto' : '100%',
                   maxWidth: '100%',
                   maxHeight: '100%',
                   aspectRatio: `${resolution.width} / ${resolution.height}`
                 }}>
              <canvas 
                ref={canvasRef} 
                className="w-full h-full block"
              />
              <div className="absolute -top-6 left-0 text-[10px] text-brutal-white/40 uppercase tracking-tighter">
                Live_Render_Buffer :: {resolution.width}x{resolution.height}
              </div>
            </div>
          </div>

          {/* --- Timeline --- */}
          <div className="h-64 border-t border-brutal-white/20 bg-brutal-black flex flex-col">
            <div className="h-10 border-b border-brutal-white/10 flex items-center px-4 justify-between bg-black">
              <div className="flex items-center gap-4">
                <button onClick={() => setIsPlaying(!isPlaying)} className="hover:text-claw-red transition-colors">
                  {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                </button>
                <button onClick={() => { setIsPlaying(false); setCurrentTime(0); }} className="hover:text-claw-red transition-colors">
                  <Square size={18} fill="currentColor" />
                </button>
                <div className="text-xs font-bold text-claw-red">
                  {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
                </div>
              </div>
              <div className="flex items-center gap-4">
                 <Scissors size={14} className="opacity-40 hover:opacity-100 cursor-pointer" />
                 <Move size={14} className="opacity-40 hover:opacity-100 cursor-pointer" />
              </div>
            </div>
            
            <div className="flex-1 overflow-x-auto overflow-y-auto relative p-4 custom-scrollbar">
               {/* Timeline Grid */}
               <div className="absolute top-0 left-0 h-full w-full pointer-events-none opacity-5" 
                    style={{ backgroundImage: 'linear-gradient(90deg, #f2f2f2 1px, transparent 1px)', backgroundSize: '100px 100%' }} />
               
               {/* Playhead */}
               <div 
                 ref={playheadRef}
                 className="absolute top-0 bottom-0 w-px bg-claw-red z-10 pointer-events-none shadow-[0_0_8px_#e63946]"
                 style={{ left: `${(currentTime / duration) * 100}%` }}
               >
                 <div className="absolute -top-1 -left-[5px] w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[8px] border-t-claw-red" />
               </div>

               <div className="flex flex-col gap-2 min-w-full" style={{ width: '200%' }}>
                 {layers.map(layer => (
                   <div key={layer.id} className="h-8 flex relative group">
                     <div 
                       className={`absolute h-full border-l-2 border-r-2 flex items-center px-2 text-[10px] font-bold truncate transition-all cursor-move
                                  ${selectedLayerId === layer.id ? 'bg-claw-red text-black border-brutal-white' : 'bg-brutal-white/10 text-brutal-white border-brutal-white/20 hover:bg-brutal-white/20'}`}
                       style={{ 
                         left: `${(layer.start / duration) * 100}%`, 
                         width: `${(layer.duration / duration) * 100}%` 
                       }}
                       onClick={() => setSelectedLayerId(layer.id)}
                     >
                       {layer.name.toUpperCase()}
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        </section>

        {/* --- Right Sidebar: Inspector --- */}
        <aside className="w-80 border-l border-brutal-white/20 bg-brutal-black overflow-y-auto p-6">
          {!selectedLayer ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20 text-center">
              <Settings size={48} className="mb-4" />
              <p className="text-xs uppercase tracking-widest font-bold">Select a layer<br/>to edit properties</p>
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] mb-4 text-claw-red">Layer Identity</h3>
                <input 
                  type="text" 
                  value={selectedLayer.name}
                  onChange={(e) => updateLayer(selectedLayer.id, { name: e.target.value })}
                  className="w-full bg-transparent border-b border-brutal-white/20 py-2 focus:border-claw-red outline-none text-sm"
                />
              </div>

              {selectedLayer.type === 'text' && (
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] mb-4 text-claw-red">Typography</h3>
                  <textarea 
                    value={selectedLayer.props.text}
                    onChange={(e) => updateLayerProps(selectedLayer.id, { text: e.target.value })}
                    className="w-full bg-[#111] border border-brutal-white/10 p-3 mb-4 h-24 text-sm resize-none focus:border-claw-red outline-none"
                  />
                  
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] opacity-40">FONT_FAMILY</label>
                      <select 
                        value={selectedLayer.props.fontFamily}
                        onChange={(e) => updateLayerProps(selectedLayer.id, { fontFamily: e.target.value })}
                        className="bg-black border border-brutal-white/10 p-2 text-xs"
                      >
                        {FONTS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                      </select>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] opacity-40">SIZE</label>
                        <input 
                          type="number" 
                          value={selectedLayer.props.fontSize}
                          onChange={(e) => updateLayerProps(selectedLayer.id, { fontSize: parseInt(e.target.value) })}
                          className="bg-black border border-brutal-white/10 p-2 text-xs"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] opacity-40">COLOR</label>
                        <div className="flex gap-2">
                          <input 
                            type="color" 
                            value={selectedLayer.props.color}
                            onChange={(e) => updateLayerProps(selectedLayer.id, { color: e.target.value })}
                            className="w-8 h-8 bg-transparent border-none p-0 cursor-pointer"
                          />
                          <input 
                            type="text" 
                            value={selectedLayer.props.color.toUpperCase()}
                            onChange={(e) => updateLayerProps(selectedLayer.id, { color: e.target.value })}
                            className="bg-black border border-brutal-white/10 p-2 text-xs flex-1 uppercase"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] mb-4 text-claw-red">Motion & Transform</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                  {[
                    { label: 'POS_X', key: 'x' },
                    { label: 'POS_Y', key: 'y' },
                    { label: 'SCALE', key: 'scale', step: 0.1 },
                    { label: 'ROTATION', key: 'rotation' },
                    { label: 'OPACITY', key: 'opacity', step: 0.1, max: 1 }
                  ].map(prop => (
                    <div key={prop.key} className="flex flex-col gap-2">
                      <label className="text-[10px] opacity-40">{prop.label}</label>
                      <input 
                        type="number" 
                        step={prop.step || 1}
                        value={selectedLayer.props[prop.key]}
                        onChange={(e) => updateLayerProps(selectedLayer.id, { [prop.key]: parseFloat(e.target.value) })}
                        className="bg-black border border-brutal-white/10 p-2 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] mb-4 text-claw-red">Sequence FX</h3>
                <div className="flex flex-col gap-2">
                   <label className="text-[10px] opacity-40">ANIMATION_PRESET</label>
                   <select 
                     value={selectedLayer.props.animation}
                     onChange={(e) => updateLayerProps(selectedLayer.id, { animation: e.target.value })}
                     className="bg-black border border-brutal-white/10 p-2 text-xs"
                   >
                     {Object.values(ANIMATION_PRESETS).map(v => <option key={v} value={v}>{v.toUpperCase()}</option>)}
                   </select>
                </div>
              </div>
              
              <div className="pt-8 border-t border-brutal-white/10">
                <button 
                  onClick={() => deleteLayer(selectedLayer.id)}
                  className="w-full border border-claw-red text-claw-red p-3 text-[10px] font-bold hover:bg-claw-red hover:text-black transition-colors"
                >
                  PURGE_LAYER_DATA
                </button>
              </div>
            </div>
          )}
        </aside>
      </main>

      {/* --- Global Notifications/Status --- */}
      <footer className="h-6 bg-claw-red text-black flex items-center px-4 justify-between text-[10px] font-bold">
        <div className="flex gap-4">
          <span>SYSTEM_READY</span>
          <span>MEMORY_OK</span>
          <span>LAYERS: {layers.length}</span>
        </div>
        <div>
          POKEMOTION_V2.0_ENGINE // BUILD_2026.06.10
        </div>
      </footer>
    </div>
  );
}