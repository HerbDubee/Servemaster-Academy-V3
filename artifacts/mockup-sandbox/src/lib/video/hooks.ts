import { useState, useEffect, useRef } from 'react';

declare global {
  interface Window {
    startRecording?: () => void;
    stopRecording?: () => void;
  }
}

export function useVideoPlayer({ durations }: { durations: Record<string, number> }) {
  const [currentScene, setCurrentScene] = useState(0);
  const durationsRef = useRef(durations);

  useEffect(() => {
    const sceneKeys = Object.keys(durationsRef.current);
    let timeout: ReturnType<typeof setTimeout>;
    let isFirstPass = true;

    window.startRecording?.();

    const playScene = (index: number) => {
      setCurrentScene(index);
      const duration = durationsRef.current[sceneKeys[index]];
      timeout = setTimeout(() => {
        if (index === sceneKeys.length - 1) {
          if (isFirstPass) {
            window.stopRecording?.();
            isFirstPass = false;
          }
          playScene(0); // Loop forever
        } else {
          playScene(index + 1);
        }
      }, duration);
    };

    playScene(0);

    return () => clearTimeout(timeout);
  }, []);

  return { currentScene };
}
