import { useState, useEffect } from 'react';

export default function LoadingScreen({ onFinish }) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFadeOut(true), 1800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (fadeOut) {
      const timer = setTimeout(onFinish, 600);
      return () => clearTimeout(timer);
    }
  }, [fadeOut, onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-[#0f172a] transition-opacity duration-600 ${
        fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/30 animate-pulse">
            <span className="text-white font-bold text-xl">EP</span>
          </div>
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-400 rounded-full border-2 border-[#0f172a]" />
        </div>
        <div className="text-center">
          <h1 className="text-white font-bold text-2xl tracking-tight">Evidence Pilot</h1>
          <p className="text-indigo-300/60 text-sm mt-1 font-medium">Empowering evidence-based research</p>
        </div>
      </div>
    </div>
  );
}
