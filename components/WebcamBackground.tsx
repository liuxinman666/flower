import React, { useEffect, useRef } from 'react';

const WebcamBackground: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  // 1. FINER RIPPLES: Increased resolution (was 160x120)
  // This makes the wave crests thinner and the simulation more detailed.
  const width = 320; 
  const height = 240; 
  
  // Ripple buffers
  const buffer1 = useRef(new Int16Array(width * height));
  const buffer2 = useRef(new Int16Array(width * height));
  const prevFrame = useRef<Uint8ClampedArray | null>(null);

  // Helper canvas for reading video data
  const tempCanvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const startWebcam = async () => {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
          }
        } catch (error) {
          console.error("Error accessing webcam:", error);
          // Fallback: Auto ripples if no webcam
          setInterval(() => {
             const x = Math.floor(Math.random() * width);
             const y = Math.floor(Math.random() * height);
             buffer1.current[y * width + x] = 5000;
          }, 500);
        }
      }
    };
    startWebcam();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to simulation size (CSS scales it up)
    canvas.width = width;
    canvas.height = height;

    // Initialize temp canvas for video processing
    const tCanvas = document.createElement('canvas');
    tCanvas.width = width;
    tCanvas.height = height;
    tempCanvas.current = tCanvas;
    const tCtx = tCanvas.getContext('2d', { willReadFrequently: true });

    const processRipples = () => {
      const b1 = buffer1.current;
      const b2 = buffer2.current;
      const w = width;
      const h = height;

      // 1. Motion Detection (Input)
      if (videoRef.current && videoRef.current.readyState === 4 && tCtx) {
        // Draw small video frame
        tCtx.drawImage(videoRef.current, 0, 0, w, h);
        const frame = tCtx.getImageData(0, 0, w, h);
        const data = frame.data;

        // Compare with previous frame
        if (prevFrame.current) {
            // 2. REFINED SENSITIVITY: Lower threshold (was 30)
            const threshold = 15; 
            // Step size 4 (every pixel) or 8 (every other pixel). 
            // Using 4 ensures we catch smaller finger movements.
            for (let i = 0; i < data.length; i += 4) { 
                // Check Green channel difference (usually good for skin tone contrast against backgrounds)
                const diff = Math.abs(data[i + 1] - prevFrame.current[i + 1]);
                
                if (diff > threshold) {
                    const pixelIndex = i / 4;
                    // Add energy. 
                    // Since resolution is higher, we add slightly less per pixel to avoid "noise",
                    // but the aggregate effect is smoother.
                    b1[pixelIndex] += diff * 2; 
                }
            }
        }
        prevFrame.current = data;
      }

      // 2. Ripple Algorithm (Propagate)
      // Standard water ripple algorithm:
      // NewHeight(x,y) = (Prev(x-1,y) + Prev(x+1,y) + Prev(x,y-1) + Prev(x,y+1)) / 2 - Current(x,y)
      // Optimized loop for performance
      for (let y = 1; y < h - 1; y++) {
        // Pre-calculate row offsets
        const rowOffset = y * w;
        const prevRowOffset = (y - 1) * w;
        const nextRowOffset = (y + 1) * w;
        
        for (let x = 1; x < w - 1; x++) {
          const i = rowOffset + x;
          const val = (b1[i - 1] + b1[i + 1] + b1[prevRowOffset + x] + b1[nextRowOffset + x]) >> 1;
          
          let nextVal = val - b2[i];
          
          // 3. FLUIDITY: Damping factor
          // Shift 5 = 1/32 decay (faster stop). Shift 6 = 1/64 decay (longer, smoother waves).
          nextVal -= nextVal >> 6; 
          
          b2[i] = nextVal;
        }
      }

      // Swap buffers
      const temp = buffer1.current;
      buffer1.current = buffer2.current;
      buffer2.current = temp;

      // 3. Render Output
      const imageData = ctx.createImageData(w, h);
      const pixelData = imageData.data;

      for (let i = 0; i < w * h; i++) {
        const ripple = buffer1.current[i];
        const index = i * 4;
        
        // 4. PALE BLUE COLOR
        if (ripple > 0) {
            // Clamp intensity
            let intensity = ripple;
            if (intensity > 255) intensity = 255;
            
            // To make it "Pale Blue" (Ice/Crystal like):
            // We need high Blue, medium-high Green, and low-medium Red.
            // Example LightBlue is (173, 216, 230).
            // Previous was (0, 0.8, 1.0) -> Deep Cyan/Blue.
            
            // New logic:
            pixelData[index] = intensity * 0.6;     // R: Adds whiteness
            pixelData[index + 1] = intensity * 0.85; // G: Cyan tint
            pixelData[index + 2] = intensity * 1.0;  // B: Full Blue
            pixelData[index + 3] = 255; // Alpha
        } else {
            // Deep Black Background
            pixelData[index] = 0;
            pixelData[index + 1] = 0;
            pixelData[index + 2] = 0;
            pixelData[index + 3] = 255; 
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      requestRef.current = requestAnimationFrame(processRipples);
    };

    requestRef.current = requestAnimationFrame(processRipples);

    return () => {
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  return (
    <>
      <video 
        ref={videoRef} 
        className="hidden" 
        muted 
        playsInline 
      />
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full object-cover opacity-80 pointer-events-none"
        style={{ imageRendering: 'auto' }} // Changed to auto for smoother scaling on high-res simulation
      />
    </>
  );
};

export default WebcamBackground;