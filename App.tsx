import React, { useState } from 'react';
import WebcamBackground from './components/WebcamBackground';
import ParticleCanvas from './components/ParticleCanvas';
import { Upload, Camera, Info, Sparkles, Loader2 } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

const App: React.FC = () => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [showUI, setShowUI] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setImageSrc(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateImage = async () => {
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { text: 'A centered, symmetrical Lotus flower composed entirely of soft glowing particles. Colors: Pastel Pink, Soft Yellow, and Azure Blue. Deep black background. The petals are delicate, translucent, and ethereal. High contrast, 8k resolution, macro particle render, bioluminescent, dreamlike texture.' }
          ]
        }
      });

      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            const base64Image = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            setImageSrc(base64Image);
            setShowUI(false); // Auto-hide UI for immersion
            break;
          }
        }
      }
    } catch (error) {
      console.error("Generation failed", error);
      alert("Could not generate image. Please check your API key or try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden text-white font-sans selection:bg-pink-500 selection:text-white">
      {/* 1. Webcam Layer (Background) */}
      <WebcamBackground />

      {/* 2. Particle Canvas Layer (Midground) */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <ParticleCanvas imageSrc={imageSrc} />
      </div>

      {/* 3. Interaction & UI Layer (Foreground) */}
      <div 
        className={`absolute inset-0 z-20 transition-opacity duration-700 ${showUI ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}
      >
        {/* Header / Instructions */}
        {!imageSrc && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center p-8 bg-black/70 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl max-w-md w-full ring-1 ring-white/5">
            <div className="relative inline-block mb-6">
              <Camera className="w-20 h-20 text-white/90" strokeWidth={1.5} />
              <Sparkles className="absolute -top-2 -right-2 w-8 h-8 text-pink-300 animate-pulse" />
            </div>
            
            <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-pink-400 via-yellow-200 to-blue-400 mb-3 tracking-tight">
              HoloLotus FX
            </h1>
            <p className="text-gray-400 mb-8 leading-relaxed font-light">
              Generate a mystical particle lotus or upload your own. Experience the folding and breathing simulation.
            </p>
            
            <div className="flex flex-col gap-4">
              <button 
                onClick={handleGenerateImage}
                disabled={isGenerating}
                className="group relative flex items-center justify-center px-8 py-4 overflow-hidden font-bold rounded-2xl transition-all duration-300 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:shadow-[0_0_40px_-10px_rgba(255,182,193,0.5)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Materializing...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" /> Generate Lotus
                  </span>
                )}
              </button>

              <div className="relative flex items-center justify-center">
                 <div className="h-px bg-white/10 w-full"></div>
                 <span className="px-3 text-xs text-white/30 uppercase tracking-widest bg-transparent absolute">or</span>
              </div>

              <label className="cursor-pointer group flex items-center justify-center px-8 py-4 border border-white/10 rounded-2xl hover:bg-white/5 transition-all duration-300 hover:border-white/30">
                <span className="flex items-center gap-2 text-gray-300 group-hover:text-white">
                  <Upload className="w-5 h-5" /> Upload Image
                </span>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleImageUpload} 
                  className="hidden" 
                />
              </label>
            </div>
          </div>
        )}

        {/* HUD Controls when image is loaded */}
        {imageSrc && (
          <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 flex items-center gap-2 p-2 bg-black/60 backdrop-blur-xl rounded-full border border-white/10 pointer-events-auto shadow-2xl">
             <button 
                onClick={handleGenerateImage}
                disabled={isGenerating}
                className="p-3 hover:bg-white/10 rounded-full transition-colors group" 
                title="Generate New"
              >
                {isGenerating ? <Loader2 className="w-6 h-6 animate-spin text-blue-400"/> : <Sparkles className="w-6 h-6 text-pink-400 group-hover:scale-110 transition-transform" />}
             </button>
             
             <label className="cursor-pointer p-3 hover:bg-white/10 rounded-full transition-colors group" title="Upload Image">
              <Upload className="w-6 h-6 text-yellow-200 group-hover:scale-110 transition-transform" />
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleImageUpload} 
                className="hidden" 
              />
            </label>
            
            <div className="h-6 w-px bg-white/20 mx-1"></div>
            
            <button 
              onClick={() => setShowUI(!showUI)}
              className="px-4 py-2 hover:bg-white/10 rounded-full transition-colors text-xs font-bold text-white/90 uppercase tracking-widest"
            >
              {showUI ? 'Hide' : 'Show'}
            </button>
          </div>
        )}
        
        {/* Info Corner */}
        <div className="absolute top-6 right-6 group pointer-events-auto">
          <div className="p-3 bg-black/30 backdrop-blur-md rounded-full cursor-help hover:bg-white/10 transition-colors border border-white/5">
            <Info className="w-5 h-5 text-white/60" />
          </div>
          <div className="absolute right-0 top-14 w-72 p-6 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl text-sm text-gray-300 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0 duration-300 pointer-events-none shadow-2xl">
            <h3 className="text-white font-bold mb-2">Interactions</h3>
            <ul className="list-disc list-inside space-y-1 text-white/70">
              <li>Flower folds and unfolds slowly</li>
              <li>Mouse over particles to push them</li>
              <li>Camera feed acts as the live background</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;