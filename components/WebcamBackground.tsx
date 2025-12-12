import React, { useEffect, useRef, useState } from 'react';

const WebcamBackground: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startWebcam = async () => {
      try {
        const constraints = {
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: 'user'
          },
          audio: false
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Wait for metadata to load before playing
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(e => console.error("Play error:", e));
          };
        }
      } catch (err) {
        console.error("Error accessing webcam:", err);
        setError("Camera access denied or unavailable.");
      }
    };

    startWebcam();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-400 z-0">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className="absolute inset-0 w-full h-full object-cover z-0 opacity-40 grayscale-[30%] contrast-125 transition-opacity duration-1000"
      style={{ transform: 'scaleX(-1)' }} // Mirror the webcam
      playsInline
      muted
      autoPlay
    />
  );
};

export default WebcamBackground;