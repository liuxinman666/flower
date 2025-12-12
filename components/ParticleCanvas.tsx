import React, { useEffect, useRef, useCallback } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

interface ParticleCanvasProps {
  imageSrc: string | null;
}

// ---------------------------
// FALLING PETAL CLASS
// ---------------------------
class FallingPetal {
  x: number;
  y: number;
  z: number;
  size: number;
  vy: number;
  vx: number;
  swayFreq: number;
  swayAmp: number;
  phase: number;
  angle: number;
  rotationSpeed: number;
  flipAngle: number;
  flipSpeed: number;
  color: string;
  opacity: number;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.x = 0;
    this.y = 0;
    this.z = 1;
    this.size = 1;
    this.vy = 0;
    this.vx = 0;
    this.swayFreq = 0;
    this.swayAmp = 0;
    this.phase = 0;
    this.angle = 0;
    this.rotationSpeed = 0;
    this.flipAngle = 0;
    this.flipSpeed = 0;
    this.color = '#fff';
    this.opacity = 1;
    this.init(canvasWidth, canvasHeight, true);
  }

  init(width: number, height: number, randomY: boolean = false) {
    this.x = Math.random() * width;
    this.y = randomY ? Math.random() * height : -50 - Math.random() * 100;
    this.z = Math.random() * 0.8 + 0.5; 
    this.size = (Math.random() * 6 + 6) * this.z; 
    const colors = ['#FFC0CB', '#FFB6C1', '#FF69B4', '#FFB7C5', '#FFE4E1'];
    this.color = colors[Math.floor(Math.random() * colors.length)];
    this.opacity = Math.random() * 0.4 + 0.4; 
    this.vy = (Math.random() * 1.0 + 1.0) * this.z; 
    this.vx = (Math.random() - 0.5) * 1.0; 
    this.swayFreq = Math.random() * 0.003 + 0.001; 
    this.swayAmp = (Math.random() * 1.5 + 0.5) * this.z;
    this.phase = Math.random() * Math.PI * 2;
    this.angle = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 0.02;
    this.flipAngle = Math.random() * Math.PI;
    this.flipSpeed = (Math.random() * 0.02 + 0.005);
  }

  update(width: number, height: number, time: number) {
    const oscillation = Math.sin(time * this.swayFreq + this.phase);
    const turbulence = Math.cos(time * this.swayFreq * 3) * 0.3;
    const combinedSway = oscillation + turbulence;

    this.x += this.vx + (combinedSway * this.swayAmp);
    const dragFactor = Math.abs(combinedSway) * 0.5; 
    const currentFallSpeed = Math.max(0.3, this.vy * (1 - dragFactor * 0.6));
    this.y += currentFallSpeed;
    this.angle += this.rotationSpeed + (oscillation * 0.002);
    this.flipAngle += this.flipSpeed;

    if (this.y > height + 50) this.init(width, height, false);
    if (this.x > width + 50) this.x = -50;
    else if (this.x < -50) this.x = width + 50;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    const flipScale = Math.sin(this.flipAngle);
    const squashScale = 1 + (1 - Math.abs(flipScale)) * 0.1;
    ctx.rotate(this.angle);
    ctx.scale(squashScale, flipScale);
    ctx.globalAlpha = this.opacity;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(0, this.size);
    ctx.quadraticCurveTo(this.size, -this.size * 0.2, 0, -this.size);
    ctx.quadraticCurveTo(-this.size, -this.size * 0.2, 0, this.size);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------
// MAIN PARTICLE CLASS
// ---------------------------
class Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  baseSize: number;
  size: number;
  color: string;
  vx: number;
  vy: number;
  ease: number;
  friction: number;
  
  // Wave/Drift
  waveAmplitude: number;
  pulsePhase: number;
  driftPhase: number;
  driftSpeed: number;
  driftRadius: number;
  flashLife: number;

  constructor(x: number, y: number, color: string, canvasWidth: number, canvasHeight: number) {
    this.originX = x;
    this.originY = y;
    this.x = Math.random() * canvasWidth;
    this.y = Math.random() * canvasHeight;
    this.baseSize = Math.random() * 0.8 + 0.3; 
    this.size = this.baseSize;
    this.color = color;
    this.vx = 0;
    this.vy = 0;
    this.ease = 0.005; 
    this.friction = 0.92; 
    this.waveAmplitude = 0.2 + Math.random() * 1.0; 
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.driftPhase = Math.random() * Math.PI * 2;
    this.driftSpeed = 0.5 + Math.random() * 1.5; 
    this.driftRadius = 1.0 + Math.random() * 3.0; 
    this.flashLife = 0;
  }

  flash() {
    this.flashLife = 1.0;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.globalAlpha = 1.0;
    if (this.flashLife > 0) {
      ctx.beginPath();
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = this.flashLife * 0.6;
      ctx.arc(this.x, this.y, this.size * 8 + 2, 0, Math.PI * 2); 
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = '#FFFFFF';
    } else {
      ctx.fillStyle = this.color;
    }
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }

  update(mouse: { x: number; y: number; radius: number }, time: number, canvasWidth: number, canvasHeight: number, bloomFactor: number) {
    // 1. DYNAMIC BLOOM (Controlled by Hand or Auto Sine)
    // bloomFactor is 0 (Closed) to 1 (Open)
    // Map bloomFactor to scale: 0.2 (Tight bud) -> 1.1 (Fully Open)
    const bloomScale = 0.2 + (bloomFactor * 0.9);

    // 2. PARTICLE SIZE DYNAMICS
    const pulse = Math.sin(time * 2 + this.pulsePhase);
    this.size = this.baseSize * (1 + pulse * 0.2 + bloomFactor * 0.2);
    if (this.size < 0.1) this.size = 0.1;

    // Flash Decay
    if (this.flashLife > 0) {
      this.flashLife -= 0.05; 
      if (this.flashLife < 0) this.flashLife = 0;
    }

    // 3. FLOWER FOLDING (Rotation & Expansion)
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    const relativeX = this.originX - centerX;
    const relativeY = this.originY - centerY;
    
    // Twist effect: More twist when closed (bloomScale low)
    const rotationStrength = (1.1 - bloomScale) * 1.5; 
    const currentDist = Math.sqrt(relativeX * relativeX + relativeY * relativeY);
    const currentAngle = Math.atan2(relativeY, relativeX);
    
    // Twist increases with distance from center
    const newAngle = currentAngle + rotationStrength * (currentDist / 200);

    const rotatedX = Math.cos(newAngle) * currentDist;
    const rotatedY = Math.sin(newAngle) * currentDist;

    // Outer Petal Expansion: Exaggerate outer particles when opening
    const maxDimension = Math.min(canvasWidth, canvasHeight) / 2;
    const normalizedDist = Math.min(currentDist / maxDimension, 1.0);
    const outerExpansion = 1.0 + (normalizedDist * normalizedDist * 0.5 * bloomFactor);

    const combinedScale = bloomScale * outerExpansion;
    
    const targetX = centerX + (rotatedX * combinedScale);
    const targetY = centerY + (rotatedY * combinedScale);

    // Mouse Interaction
    const dx = mouse.x - this.x;
    const dy = mouse.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < mouse.radius) {
      const force = -mouse.radius / distance;
      const angle = Math.atan2(dy, dx);
      this.vx += force * Math.cos(angle) * 2; 
      this.vy += force * Math.sin(angle) * 2;
    }

    // Waves & Drift
    const waveX = Math.sin(time * 0.5 + this.originY * 0.05) * this.waveAmplitude;
    const waveY = Math.cos(time * 0.3 + this.originX * 0.05) * this.waveAmplitude;
    const driftX = Math.sin(time * this.driftSpeed + this.driftPhase) * this.driftRadius;
    const driftY = Math.cos(time * this.driftSpeed * 0.8 + this.driftPhase) * this.driftRadius;

    // Physics update
    const desiredX = targetX + waveX + driftX;
    const desiredY = targetY + waveY + driftY;

    this.vx += (desiredX - this.x) * this.ease;
    this.vy += (desiredY - this.y) * this.ease;

    this.vx *= this.friction;
    this.vy *= this.friction;

    this.x += this.vx;
    this.y += this.vy;
  }
}

const ParticleCanvas: React.FC<ParticleCanvasProps> = ({ imageSrc }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  const fallingPetalsRef = useRef<FallingPetal[]>([]);
  const mouseRef = useRef({ x: 0, y: 0, radius: 100 });
  const timeRef = useRef(0);
  
  // MediaPipe Refs
  const videoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const handBloomFactorRef = useRef(0.5); // Current bloom state
  const isHandDetectedRef = useRef(false);

  // Initialize MediaPipe
  useEffect(() => {
    const initLandmarker = async () => {
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

      if (navigator.mediaDevices?.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
            videoRef.current.srcObject = stream;
            videoRef.current.play();
        } catch (e) {
            console.error("Webcam error:", e);
        }
      }
    };
    initLandmarker();
  }, []);

  const desaturateColor = (r: number, g: number, b: number, factor: number = 0.1): string => {
    const avg = (r + g + b) / 3;
    const newR = Math.floor(r * (1 - factor) + avg * factor);
    const newG = Math.floor(g * (1 - factor) + avg * factor);
    const newB = Math.floor(b * (1 - factor) + avg * factor);
    return `rgb(${newR}, ${newG}, ${newB})`;
  };

  const initParticles = useCallback((img: HTMLImageElement, ctx: CanvasRenderingContext2D, width: number, height: number) => {
    particlesRef.current = [];
    const scale = Math.min(width / img.width, height / img.height) * 0.95; 
    const newWidth = img.width * scale;
    const newHeight = img.height * scale;
    const offsetX = (width - newWidth) / 2;
    const offsetY = (height - newHeight) / 2;

    ctx.drawImage(img, offsetX, offsetY, newWidth, newHeight);
    
    const gap = 2; 
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    for (let y = 0; y < height; y += gap) {
      for (let x = 0; x < width; x += gap) {
        const index = (y * width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const alpha = data[index + 3];
        const brightness = (r + g + b) / 3;

        if (alpha > 128 && brightness > 25) {
          let color;
          if (brightness > 230) {
             color = '#FFFFFF'; 
          } else {
             color = desaturateColor(r, g, b, 0.1); 
          }
          particlesRef.current.push(new Particle(x, y, color, width, height));
        }
      }
    }
    ctx.clearRect(0, 0, width, height);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const count = 70; 
    fallingPetalsRef.current = [];
    for (let i = 0; i < count; i++) {
        fallingPetalsRef.current.push(new FallingPetal(canvas.width || window.innerWidth, canvas.height || window.innerHeight));
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const resizeObserver = new ResizeObserver(() => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      
      fallingPetalsRef.current = [];
      const count = 70;
      for (let i = 0; i < count; i++) {
        fallingPetalsRef.current.push(new FallingPetal(canvas.width, canvas.height));
      }

      if (imageSrc) {
        const img = new Image();
        img.src = imageSrc;
        img.onload = () => initParticles(img, ctx, canvas.width, canvas.height);
      }
    });
    resizeObserver.observe(document.body);

    if (imageSrc) {
      const img = new Image();
      img.src = imageSrc;
      img.onload = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        initParticles(img, ctx, canvas.width, canvas.height);
      };
    } else {
      particlesRef.current = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      timeRef.current += 0.0005;

      // 1. Hand Tracking Logic
      if (handLandmarkerRef.current && videoRef.current && videoRef.current.readyState >= 2) {
         if (videoRef.current.currentTime !== lastVideoTimeRef.current) {
            lastVideoTimeRef.current = videoRef.current.currentTime;
            const results = handLandmarkerRef.current.detectForVideo(videoRef.current, performance.now());
            
            if (results.landmarks && results.landmarks.length > 0) {
                isHandDetectedRef.current = true;
                const hand = results.landmarks[0];
                
                // Calculate Openness:
                // Compare distance of Wrist(0) to MiddleTip(12) vs Wrist(0) to MiddleMCP(9)
                const wrist = hand[0];
                const middleTip = hand[12];
                const middleMCP = hand[9];
                
                const palmLen = Math.sqrt(
                    Math.pow(middleMCP.x - wrist.x, 2) + Math.pow(middleMCP.y - wrist.y, 2)
                );
                const fingerLen = Math.sqrt(
                    Math.pow(middleTip.x - wrist.x, 2) + Math.pow(middleTip.y - wrist.y, 2)
                );
                
                // Ratio: ~2.0 is Open, ~1.0 or less is Closed/Fist
                const ratio = fingerLen / palmLen;
                
                // Map ratio to 0-1 range
                // Clamped: <1.2 = Closed, >1.8 = Open
                let targetBloom = (ratio - 1.2) / 0.6;
                targetBloom = Math.max(0, Math.min(1, targetBloom));

                // Smooth interpolation
                handBloomFactorRef.current += (targetBloom - handBloomFactorRef.current) * 0.1;
            } else {
                isHandDetectedRef.current = false;
            }
         }
      }

      // 2. Determine Final Bloom Factor
      let bloomFactor;
      if (isHandDetectedRef.current) {
         // If hand present, it overrides auto animation
         bloomFactor = handBloomFactorRef.current;
      } else {
         // Auto Sine Wave Animation
         // Value from 0.0 to 1.0
         bloomFactor = (Math.sin(timeRef.current * 2000 * 0.001) + 1) / 2;
      }

      // 3. Draw Background Petals
      fallingPetalsRef.current.forEach(petal => {
        petal.update(canvas.width, canvas.height, timeRef.current * 1000); 
        petal.draw(ctx);
      });

      // 4. Draw Main Particles
      particlesRef.current.forEach(particle => {
        particle.update(mouseRef.current, timeRef.current, canvas.width, canvas.height, bloomFactor);
        particle.draw(ctx);
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      resizeObserver.disconnect();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [imageSrc, initParticles]);

  const handleMouseMove = (e: React.MouseEvent) => {
    mouseRef.current.x = e.clientX;
    mouseRef.current.y = e.clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
        mouseRef.current.x = e.touches[0].clientX;
        mouseRef.current.y = e.touches[0].clientY;
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    const clickX = e.clientX;
    const clickY = e.clientY;
    const interactionRadius = 50;

    particlesRef.current.forEach(p => {
        const dx = p.x - clickX;
        const dy = p.y - clickY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < interactionRadius) {
            p.flash();
        }
    });
  };

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-auto"
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      onClick={handleClick}
    />
  );
};

export default ParticleCanvas;