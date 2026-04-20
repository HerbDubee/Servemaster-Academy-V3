import { useEffect, useRef, useState } from 'react';
import VideoTemplate from '@/components/video/VideoTemplate';

type Status = 'idle' | 'waiting' | 'recording' | 'done' | 'error';

export default function VideoExport() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    window.startRecording = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
        chunksRef.current = [];
        mediaRecorderRef.current.start();
        setStatus('recording');
      }
    };

    window.stopRecording = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };

    return () => {
      window.startRecording = undefined;
      window.stopRecording = undefined;
    };
  }, []);

  async function beginCapture() {
    setError('');
    setStatus('waiting');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'difficult-guest-training.webm';
        a.click();
        URL.revokeObjectURL(url);
        setStatus('done');
      };

      recorder.onerror = () => {
        setError('Recording failed. Please try again.');
        setStatus('error');
      };

      mediaRecorderRef.current = recorder;
      setStatus('waiting');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Permission denied';
      if (msg.includes('Permission denied') || msg.includes('NotAllowedError')) {
        setError('Screen share was cancelled. Please try again and select the current tab.');
      } else {
        setError(msg);
      }
      setStatus('error');
    }
  }

  const totalSecs = (3 + 4 + 10 + 4 + 5);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <VideoTemplate />

      {(status === 'idle' || status === 'error') && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-6 z-50">
          <div className="text-center max-w-md px-6">
            <div className="text-4xl mb-4">🎬</div>
            <h2 className="text-white text-2xl font-bold mb-2">Export as Video</h2>
            <p className="text-zinc-300 text-sm leading-relaxed mb-1">
              Click <strong>Start Recording</strong> below, then select <strong>this browser tab</strong> in the share picker.
            </p>
            <p className="text-zinc-400 text-xs mb-4">
              The animation plays once ({totalSecs}s) then automatically saves a <code className="bg-zinc-800 px-1 rounded">.webm</code> file.
            </p>
            {error && (
              <p className="text-red-400 text-xs mb-4 bg-red-900/30 border border-red-700/40 rounded-lg px-3 py-2">{error}</p>
            )}
            <button
              onClick={beginCapture}
              className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-8 py-3 rounded-2xl text-sm transition-all"
            >
              ▶ Start Recording
            </button>
          </div>
        </div>
      )}

      {status === 'waiting' && (
        <div className="absolute top-4 right-4 bg-zinc-900/90 border border-zinc-700 rounded-xl px-4 py-2 text-xs text-zinc-300 z-50">
          ⏳ Waiting for animation to start…
        </div>
      )}

      {status === 'recording' && (
        <div className="absolute top-4 right-4 bg-red-900/90 border border-red-600 rounded-xl px-4 py-2 text-xs text-white z-50 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          Recording — {totalSecs}s
        </div>
      )}

      {status === 'done' && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 z-50">
          <div className="text-5xl">✅</div>
          <h2 className="text-white text-xl font-bold">Video Saved!</h2>
          <p className="text-zinc-300 text-sm">Check your downloads folder for <code className="bg-zinc-800 px-1 rounded">difficult-guest-training.webm</code></p>
          <button
            onClick={() => setStatus('idle')}
            className="mt-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-white font-semibold px-6 py-2 rounded-xl text-sm transition-all"
          >
            Record Again
          </button>
        </div>
      )}
    </div>
  );
}
