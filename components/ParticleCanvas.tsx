import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

interface ParticleCanvasProps {
  imageSrc?: string | null;
}

// Adjusted counts: Significantly higher density for "HD" look
const FLOWER_COUNT = 45000;
const BG_COUNT = 5000;
const PARTICLE_COUNT = FLOWER_COUNT + BG_COUNT;

// HUD Constants
const FONT_MONO = "10px 'Courier New', monospace";
const COLOR_HUD_TEXT = "rgba(200, 255, 255, 0.9)";
const COLOR_HUD_BG = "rgba(0, 10, 20, 0.6)";
const COLOR_ACCENT = "#00BFFF";
const COLOR_WARN = "#FFD700";
const COLOR_SKELETON = "rgba(255, 255, 255, 0.8)"; 

const ParticleCanvas: React.FC<ParticleCanvasProps> = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  
  // Three.js Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);
  
  // HUD Refs
  const hudCanvasRef = useRef<HTMLCanvasElement>(null);
  const logsRef = useRef<string[]>([]);
  const prevTipsRef = useRef<{ thumb: {x:number, y:number}, index: {x:number, y:number}, time: number } | null>(null);
  
  // Logic Refs
  const targetPositionsRef = useRef<Float32Array | null>(null);
  const currentPositionsRef = useRef<Float32Array | null>(null);
  const baseColorsRef = useRef<Float32Array | null>(null); // Store original colors for morphing
  const driftRef = useRef<Float32Array | null>(null);
  const bgSpeedsRef = useRef<Float32Array | null>(null);
  const frameIdRef = useRef<number>(0);
  const lastVideoTimeRef = useRef(-1);
  const handFactorRef = useRef(0);
  const proximityRef = useRef(0); // 0 (Far) to 1 (Close)

  const addLog = (msg: string) => {
    const d = new Date();
    const time = d.toLocaleTimeString('en-US', { hour12: false });
    const ms = Math.floor(d.getMilliseconds() / 10).toString().padStart(2, '0');
    logsRef.current.unshift(`[${time}.${ms}] ${msg}`);
    if (logsRef.current.length > 20) logsRef.current.pop();
  };

  useEffect(() => {
    const initVision = async () => {
      addLog("SYS: INIT VISION...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
      );
      handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1
      });
      addLog("SYS: MODEL LOADED");

      if (navigator.mediaDevices?.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
            videoRef.current.srcObject = stream;
            videoRef.current.play();
            addLog("SYS: CAM ACTIVE");
        } catch (e) {
            console.error("Webcam error:", e);
            addLog("ERR: CAM FAILED");
        }
      }
    };
    initVision();
  }, []);

  // --- REFINED LOTUS GENERATION ---
  const generateLotus = () => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const drift = new Float32Array(PARTICLE_COUNT * 3);
    const bgSpeeds = new Float32Array(PARTICLE_COUNT * 3);
    
    // Palette
    const colorPod = new THREE.Color('#FFD700'); // Gold for seeds
    const colorPodBase = new THREE.Color('#9ACD32'); // YellowGreen for pod base
    const colorPetalBase = new THREE.Color('#F8F8FF'); // GhostWhite base
    const colorPetalTip = new THREE.Color('#FF1493'); // Deep Pink tip
    const colorPetalMid = new THREE.Color('#FF69B4'); // Hot Pink mid

    let pIndex = 0;

    // 1. THE POD (Lotus Seed Head)
    const podBudget = Math.floor(FLOWER_COUNT * 0.12);
    for (let i = 0; i < podBudget; i++) {
        const topRadius = 0.45;
        const bottomRadius = 0.15;
        const podHeight = 0.4;
        let x, y, z, c;

        if (Math.random() > 0.35) {
             const r = Math.sqrt(Math.random()) * topRadius;
             const angle = Math.random() * Math.PI * 2;
             x = r * Math.cos(angle);
             z = r * Math.sin(angle);
             y = podHeight / 2;
             if (Math.random() > 0.85) c = colorPod; 
             else c = colorPodBase;
        } else {
             const h = Math.random(); 
             const r = bottomRadius + (topRadius - bottomRadius) * h;
             const angle = Math.random() * Math.PI * 2;
             x = r * Math.cos(angle);
             z = r * Math.sin(angle);
             y = (h - 0.5) * podHeight;
             c = colorPodBase;
        }

        const ix = pIndex * 3;
        positions[ix] = x;
        positions[ix+1] = y + 0.15; 
        positions[ix+2] = z;

        colors[ix] = c.r;
        colors[ix+1] = c.g;
        colors[ix+2] = c.b;

        drift[ix] = (Math.random()-0.5) * 1.5;
        drift[ix+1] = (Math.random()-0.5) * 1.5;
        drift[ix+2] = (Math.random()-0.5) * 1.5;
        pIndex++;
    }

    // 2. THE PETALS
    const layers = [
        { count: 6,  radiusBase: 0.5, length: 1.1, tilt: 0.15, width: 0.45, curve: 0.2, yOff: 0.0 },
        { count: 9,  radiusBase: 0.7, length: 1.4, tilt: 0.45, width: 0.65, curve: 0.4, yOff: 0.1 },
        { count: 12, radiusBase: 0.9, length: 1.7, tilt: 0.8, width: 0.85, curve: 0.7, yOff: 0.18 },
        { count: 18, radiusBase: 1.1, length: 2.0, tilt: 1.1, width: 1.0, curve: 0.9, yOff: 0.28 },
        { count: 24, radiusBase: 1.3, length: 2.2, tilt: 1.4, width: 1.1, curve: 0.6, yOff: 0.35 },
    ];

    const petalBudget = FLOWER_COUNT - pIndex;
    const particlesPerPetal = Math.floor(petalBudget / layers.reduce((acc, l) => acc + l.count, 0));

    layers.forEach((layer, lIdx) => {
        for (let p = 0; p < layer.count; p++) {
            const petalCenterAngle = (p / layer.count) * Math.PI * 2 + (lIdx * 0.5);

            for (let k = 0; k < particlesPerPetal; k++) {
                if (pIndex >= FLOWER_COUNT) break;

                let u = (Math.random() - 0.5);
                let v = Math.random();
                const shapeWidth = Math.sin(v * Math.PI) * layer.width;
                const localX = u * shapeWidth + (Math.random()-0.5) * 0.015; 
                const localY = v * layer.length;
                const edgeCurl = -Math.pow(Math.abs(u * 2), 2.5) * 0.15; 
                const localZ = (Math.random() - 0.5) * 0.02 + edgeCurl; 
                const curveZ = -Math.pow(v, 1.4) * layer.curve;

                const cosT = Math.cos(layer.tilt);
                const sinT = Math.sin(layer.tilt);
                let y1 = localY * cosT - (localZ + curveZ) * sinT;
                let z1 = localY * sinT + (localZ + curveZ) * cosT;
                z1 += layer.radiusBase;

                const cosA = Math.cos(petalCenterAngle);
                const sinA = Math.sin(petalCenterAngle);
                
                const finalX = localX * cosA + z1 * sinA;
                const finalZ = -localX * sinA + z1 * cosA;
                const finalY = y1 + layer.yOff - 0.9; 

                const ix = pIndex * 3;
                positions[ix] = finalX;
                positions[ix+1] = finalY;
                positions[ix+2] = finalZ;

                let c = new THREE.Color();
                if (v < 0.25) c.copy(colorPetalBase);
                else if (v < 0.65) c.copy(colorPetalBase).lerp(colorPetalMid, (v - 0.25) * 2.5);
                else c.copy(colorPetalMid).lerp(colorPetalTip, (v - 0.65) * 2.8);
                
                colors[ix] = c.r;
                colors[ix+1] = c.g;
                colors[ix+2] = c.b;

                drift[ix] = (Math.random() - 0.5) * 5;
                drift[ix+1] = (Math.random() - 0.5) * 5;
                drift[ix+2] = (Math.random() - 0.5) * 5;

                pIndex++;
            }
        }
    });

    // 3. BACKGROUND 
    for (let i = pIndex; i < PARTICLE_COUNT; i++) {
        const ix = i * 3;
        const range = 25; 
        positions[ix] = (Math.random() - 0.5) * range;
        positions[ix+1] = (Math.random() - 0.5) * range;
        positions[ix+2] = (Math.random() - 0.5) * range;

        bgSpeeds[ix] = (Math.random() - 0.5) * 0.01;
        bgSpeeds[ix+1] = (Math.random() * 0.02) + 0.005; 
        bgSpeeds[ix+2] = (Math.random() - 0.5) * 0.01;

        const c = colorPetalMid.clone().multiplyScalar(0.4 + Math.random() * 0.3);
        colors[ix] = c.r;
        colors[ix+1] = c.g;
        colors[ix+2] = c.b;
    }

    return { positions, colors, drift, bgSpeeds };
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.03); 
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 2.2, 3.5); 
    camera.lookAt(0, 0.4, 0); 
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const hudCanvas = document.createElement('canvas');
    hudCanvas.className = "absolute inset-0 pointer-events-none z-20";
    hudCanvas.width = window.innerWidth;
    hudCanvas.height = window.innerHeight;
    containerRef.current.appendChild(hudCanvas);
    hudCanvasRef.current = hudCanvas;

    const geometry = new THREE.BufferGeometry();
    const { positions, colors, drift, bgSpeeds } = generateLotus();
    
    // Store original data
    targetPositionsRef.current = positions;
    baseColorsRef.current = new Float32Array(colors); // Copy for color morphing logic
    driftRef.current = drift;
    bgSpeedsRef.current = bgSpeeds;
    currentPositionsRef.current = new Float32Array(positions); 
    
    geometry.setAttribute('position', new THREE.BufferAttribute(currentPositionsRef.current, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometryRef.current = geometry;

    const material = new THREE.PointsMaterial({
      size: 0.028,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending, 
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);
    particlesRef.current = points;

    const drawSineLine = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, active: boolean) => {
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        
        ctx.beginPath();
        if (active) {
            const steps = dist / 2;
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const bx = x1 + (x2 - x1) * t;
                const by = y1 + (y2 - y1) * t;
                const offset = Math.sin(t * 15 - Date.now() / 50) * 8 * Math.sin(t * Math.PI); 
                const ox = offset * Math.cos(angle + Math.PI/2);
                const oy = offset * Math.sin(angle + Math.PI/2);
                ctx.lineTo(bx + ox, by + oy);
            }
            ctx.strokeStyle = COLOR_WARN;
            ctx.lineWidth = 2.5;
            ctx.shadowBlur = 15;
            ctx.shadowColor = COLOR_WARN;
        } else {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = COLOR_SKELETON;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);
            ctx.shadowBlur = 0;
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        ctx.fillStyle = active ? "#FFF" : "rgba(255,255,255,0.7)";
        ctx.font = "10px monospace";
        ctx.fillText(`${dist.toFixed(0)}px`, cx, cy - 10);
    };

    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      const timeNow = performance.now();

      // --- HUD RENDERING ---
      const ctx = hudCanvasRef.current?.getContext('2d');
      if (ctx && hudCanvasRef.current) {
          ctx.clearRect(0, 0, hudCanvasRef.current.width, hudCanvasRef.current.height);
          
          ctx.fillStyle = COLOR_HUD_BG;
          ctx.fillRect(0, 0, 250, hudCanvasRef.current.height);
          
          ctx.fillStyle = "#FFF";
          ctx.font = "bold 14px 'Courier New'";
          ctx.fillText("SYSTEM MONITOR_V1.3", 15, 30);
          ctx.fillStyle = COLOR_ACCENT;
          ctx.fillRect(15, 40, 220, 2);

          const yStart = 60;
          const lineH = 18;
          ctx.font = FONT_MONO;
          ctx.fillStyle = COLOR_HUD_TEXT;
          
          ctx.fillText(`FPS: ${(1000 / (timeNow - (lastVideoTimeRef.current * 1000 || timeNow))).toFixed(0)}`, 15, yStart);
          ctx.fillText(`LATENCY: ${(Math.random() * 5 + 10).toFixed(1)}ms`, 15, yStart + lineH);
          ctx.fillText(`PARTICLES: ${(FLOWER_COUNT/1000).toFixed(1)}K`, 15, yStart + lineH * 2);
          
          // Show Proximity
          const prox = proximityRef.current;
          const proxColor = prox > 0.5 ? "#00FFFF" : "#AAA";
          ctx.fillStyle = proxColor;
          ctx.fillText(`PROXIMITY: ${(prox * 100).toFixed(0)}%`, 15, yStart + lineH * 3);
          
          ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
          ctx.fillRect(15, yStart + lineH * 4, 220, 80);
          ctx.fillStyle = COLOR_ACCENT;
          ctx.fillText("SENSOR STATUS", 25, yStart + lineH * 5.5);
          
          const isTracking = handFactorRef.current !== undefined;
          ctx.fillStyle = isTracking ? "#0F0" : "#F00";
          ctx.fillText(isTracking ? "● ONLINE" : "● SEARCHING...", 150, yStart + lineH * 5.5);

          const mode = handFactorRef.current > 0.5 ? "BLOOM (OPEN)" : "FORM (CLOSED)";
          ctx.fillStyle = handFactorRef.current > 0.5 ? COLOR_ACCENT : COLOR_WARN;
          ctx.font = "bold 12px 'Courier New'";
          ctx.fillText(`MODE: ${mode}`, 25, yStart + lineH * 7.5);

          ctx.font = "10px monospace";
          ctx.fillStyle = "#888";
          ctx.fillText("EVENT LOG >", 15, hudCanvasRef.current.height - 220);
          
          logsRef.current.forEach((log, i) => {
              const y = hudCanvasRef.current!.height - 200 + (i * 12);
              const alpha = 1 - (i / 20);
              ctx.fillStyle = `rgba(150, 255, 200, ${alpha})`;
              ctx.fillText(log, 15, y);
          });
      }

      // --- HAND TRACKING ---
      if (handLandmarkerRef.current && videoRef.current && videoRef.current.readyState >= 2) {
        if (videoRef.current.currentTime !== lastVideoTimeRef.current) {
            lastVideoTimeRef.current = videoRef.current.currentTime;
            const results = handLandmarkerRef.current.detectForVideo(videoRef.current, timeNow);
            
            if (results.landmarks && results.landmarks.length > 0) {
                const hand = results.landmarks[0];
                const thumbTip = hand[4];
                const indexTip = hand[8];
                const wrist = hand[0];
                const midTip = hand[12];

                // --- PROXIMITY CALCULATION ---
                // Calculate size of hand on screen (wrist to middle finger tip)
                // Range roughly 0.15 (far) to 0.5 (very close)
                const currentHandSize = Math.hypot(midTip.x - wrist.x, midTip.y - wrist.y);
                // Normalize 0..1
                const targetProx = Math.min(Math.max((currentHandSize - 0.15) * 3.5, 0), 1);
                proximityRef.current += (targetProx - proximityRef.current) * 0.1;

                const w = hudCanvasRef.current!.width;
                const h = hudCanvasRef.current!.height;
                const tx = (1 - thumbTip.x) * w; 
                const ty = thumbTip.y * h;
                const ix = (1 - indexTip.x) * w;
                const iy = indexTip.y * h;
                
                if (ctx) {
                    ctx.strokeStyle = COLOR_SKELETON;
                    ctx.lineWidth = 2;
                    ctx.shadowBlur = 5;
                    ctx.shadowColor = "rgba(255,255,255,0.5)";
                    
                    const joints = [[0,1,2,3,4], [0,5,6,7,8], [9,10,11,12], [13,14,15,16], [0,17,18,19,20]];
                    ctx.beginPath();
                    joints.forEach(chain => {
                        for(let j=0; j<chain.length-1; j++) {
                            const p1 = hand[chain[j]];
                            const p2 = hand[chain[j+1]];
                            ctx.moveTo((1-p1.x)*w, p1.y*h);
                            ctx.lineTo((1-p2.x)*w, p2.y*h);
                        }
                    });
                    ctx.stroke();
                    ctx.shadowBlur = 0;

                    let tv = 0, iv = 0;
                    if (prevTipsRef.current) {
                        const dt = (timeNow - prevTipsRef.current.time) / 1000;
                        if (dt > 0) {
                            tv = Math.hypot(tx - prevTipsRef.current.thumb.x, ty - prevTipsRef.current.thumb.y) / dt;
                            iv = Math.hypot(ix - prevTipsRef.current.index.x, iy - prevTipsRef.current.index.y) / dt;
                        }
                    }
                    prevTipsRef.current = { thumb: {x:tx, y:ty}, index: {x:ix, y:iy}, time: timeNow };

                    const drawTipUI = (x: number, y: number, label: string, vel: number) => {
                        ctx.fillStyle = COLOR_HUD_BG;
                        ctx.strokeStyle = COLOR_ACCENT;
                        ctx.beginPath();
                        ctx.arc(x, y, 4, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();
                        ctx.fillStyle = COLOR_HUD_TEXT;
                        ctx.font = "9px monospace";
                        ctx.fillText(`${label} [${x.toFixed(0)},${y.toFixed(0)}]`, x + 10, y);
                        ctx.fillStyle = vel > 500 ? COLOR_WARN : COLOR_ACCENT;
                        ctx.fillRect(x + 10, y + 4, Math.min(vel / 10, 50), 2);
                    };
                    drawTipUI(tx, ty, "THUMB", tv);
                    drawTipUI(ix, iy, "INDEX", iv);

                    const distPixels = Math.hypot(ix - tx, iy - ty);
                    const isPinched = distPixels < 50;
                    drawSineLine(ctx, tx, ty, ix, iy, isPinched);

                    const newState = isPinched ? 0 : 1;
                    if (Math.abs(newState - handFactorRef.current) > 0.5) {
                         if (isPinched) addLog("GESTURE: FORM DETECTED");
                         else addLog("GESTURE: BLOOM RELEASE");
                    }
                }

                const distance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
                let target = (distance - 0.05) * 5; 
                target = Math.max(0, Math.min(1.5, target)); 
                handFactorRef.current += (target - handFactorRef.current) * 0.1;

                if (Math.random() > 0.98) addLog(`CONF: ${(results.handedness[0][0].score * 100).toFixed(1)}%`);

            } else {
                handFactorRef.current += (0 - handFactorRef.current) * 0.05;
                // Decay proximity if no hand
                proximityRef.current *= 0.95;
                prevTipsRef.current = null;
            }
        }
      }

      // --- PARTICLE PHYSICS & COLOR ---
      if (geometryRef.current && targetPositionsRef.current && driftRef.current && currentPositionsRef.current && bgSpeedsRef.current && baseColorsRef.current) {
        const targets = targetPositionsRef.current;
        const current = currentPositionsRef.current;
        const drifts = driftRef.current;
        const bgSpeeds = bgSpeedsRef.current;
        const baseCols = baseColorsRef.current;
        const currentCols = geometryRef.current.attributes.color.array as Float32Array;
        
        const factor = handFactorRef.current; 
        const prox = proximityRef.current;

        const scaleStrength = 1 + factor * 2.0; 
        const spreadStrength = factor * 2.5; 

        // Target Colors for proximity (Electric Blue / Cyan / Gold mix)
        // We will shift mainly towards Cyan/Blue to contrast with Pink
        const targetR = 0.0;
        const targetG = 0.8; 
        const targetB = 1.0; 

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const ix = i * 3;
            const iy = i * 3 + 1;
            const iz = i * 3 + 2;

            if (i < FLOWER_COUNT) {
                // POSITIONS
                let tx = targets[ix];
                let ty = targets[iy];
                let tz = targets[iz];

                if (factor > 0.1) {
                    tx = tx * scaleStrength + drifts[ix] * spreadStrength;
                    ty = ty * scaleStrength + drifts[iy] * spreadStrength;
                    tz = tz * scaleStrength + drifts[iz] * spreadStrength;
                }

                current[ix] += (tx - current[ix]) * 0.1;
                current[iy] += (ty - current[iy]) * 0.1;
                current[iz] += (tz - current[iz]) * 0.1;

                // COLORS (Morph based on proximity)
                if (prox > 0.01) {
                    const br = baseCols[ix];
                    const bg = baseCols[ix+1];
                    const bb = baseCols[ix+2];
                    
                    // Lerp base -> target
                    // Use a non-linear lerp for "energy" feel (pow)
                    // We can also vary the target based on the particle's original color to preserve details
                    
                    // If original is white (Base), shift to Cyan
                    // If original is Pink (Tip), shift to Purple/DeepBlue
                    
                    // Simple mix
                    currentCols[ix] = br + (targetR - br) * prox;
                    currentCols[ix+1] = bg + (targetG - bg) * prox;
                    currentCols[ix+2] = bb + (targetB - bb) * prox;
                } else {
                    // Reset to base
                    currentCols[ix] = baseCols[ix];
                    currentCols[ix+1] = baseCols[ix+1];
                    currentCols[ix+2] = baseCols[ix+2];
                }

            } else {
                // Background
                current[ix] += bgSpeeds[ix];
                current[iy] += bgSpeeds[iy];
                current[iz] += bgSpeeds[iz];

                const range = 25;
                if (current[iy] > range) current[iy] = -range;
                if (current[ix] > range) current[ix] = -range; if (current[ix] < -range) current[ix] = range;
                if (current[iz] > range) current[iz] = -range; if (current[iz] < -range) current[iz] = range;
            }
        }
        geometryRef.current.attributes.position.needsUpdate = true;
        geometryRef.current.attributes.color.needsUpdate = true;
      }

      if (particlesRef.current) {
        particlesRef.current.rotation.y += 0.001 + (handFactorRef.current * 0.005);
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
        cancelAnimationFrame(frameIdRef.current);
        renderer.dispose();
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 w-full h-full z-10" />;
};

export default ParticleCanvas;