import React, { useState } from 'react';
import ParticleCanvas from './components/ParticleCanvas';
import { Camera, Info, Hand } from 'lucide-react';

const App: React.FC = () => {
  const [showUI, setShowUI] = useState(true);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black text-white font-sans selection:bg-pink-500 selection:text-white">
      
      {/* 1. 3D Particle System (Procedural, no image input needed) */}
      <ParticleCanvas />

      {/* 2. Interaction & UI Layer (Foreground) */}
      <div 
        className={`absolute inset-0 z-20 pointer-events-none transition-opacity duration-700 ${showUI ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* HUD Controls */}
        <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-auto">
            
            <div className="bg-black/60 backdrop-blur-xl px-6 py-3 rounded-full border border-white/10 flex items-center gap-4 shadow-2xl">
               <div className="flex items-center gap-2">
                  <Hand className="w-5 h-5 text-pink-400 animate-pulse" />
                  <span className="text-xs font-bold tracking-widest text-white/90 uppercase">
                    Interactive Mode
                  </span>
               </div>
               
               <div className="h-4 w-px bg-white/20"></div>

               <span className="text-xs text-gray-300">
                 Pinch to <span className="text-yellow-300">Form</span> • Open to <span className="text-blue-300">Bloom</span>
               </span>
            </div>

            <button 
              onClick={() => setShowUI(false)}
              className="text-[10px] text-white/30 hover:text-white transition-colors uppercase tracking-widest mt-2"
            >
              Hide UI
            </button>
        </div>
        
        {/* Info Corner */}
        <div className="absolute top-6 right-6 pointer-events-auto">
          <div className="group relative">
            <div className="p-3 bg-black/30 backdrop-blur-md rounded-full cursor-help hover:bg-white/10 transition-colors border border-white/5">
                <Info className="w-5 h-5 text-white/60" />
            </div>
            <div className="absolute right-0 top-14 w-64 p-5 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl text-sm text-gray-300 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0 duration-300 shadow-2xl">
                <h3 className="text-white font-bold mb-2">How it works</h3>
                <p className="mb-2 text-xs leading-relaxed">
                    This is a real-time 3D particle simulation inspired by a Lotus flower.
                </p>
                <ul className="list-disc list-inside space-y-1 text-xs text-white/70">
                <li><span className="text-pink-400">Hand Detection</span>: Uses webcam.</li>
                <li><span className="text-yellow-300">Closed Hand</span>: Focuses the particles into the flower shape.</li>
                <li><span className="text-blue-300">Open Hand</span>: Explodes the particles outwards.</li>
                </ul>
            </div>
          </div>
        </div>
      </div>
      
      {/* Hidden button to show UI again if hidden */}
      {!showUI && (
        <button 
            onClick={() => setShowUI(true)}
            className="absolute bottom-10 left-1/2 transform -translate-x-1/2 text-xs text-white/10 hover:text-white/50 transition-colors z-30 uppercase tracking-widest"
        >
            Show Controls
        </button>
      )}

    </div>
  );
};

export default App;