"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function QuickCapturePage() {
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cameraFacing, setCameraFacing] = useState<"back" | "front">("back");

  const stopRecording = useCallback(() => {
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTimer(0);
    // Simulate processing then go to tag screen
    setTimeout(() => {
      router.push("/tag");
    }, 500);
  }, [router]);

  const startRecording = useCallback(() => {
    setRecording(true);
    setTimer(0);
    timerRef.current = setInterval(() => {
      setTimer((t) => {
        if (t >= 8) {
          stopRecording();
          return 8;
        }
        return t + 0.1;
      });
    }, 100);
  }, [stopRecording]);

  const flipCamera = useCallback(() => {
    setCameraFacing((f) => (f === "back" ? "front" : "back"));
  }, []);

  return (
    <div className="flex flex-col min-h-dvh bg-black safe-top safe-bottom relative">
      {/* Status bar */}
      <div className="flex justify-between items-center px-6 pt-2 pb-1 text-white text-xs font-semibold z-20 relative">
        <span>9:41</span>
        <div className="flex items-center gap-1.5">
          <svg width="14" height="10" viewBox="0 0 24 24" fill="white"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></svg>
          <svg width="14" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" /><path d="M8 2v4M16 2v4" /></svg>
          <svg width="22" height="10" viewBox="0 0 24 12" fill="white"><rect x="2" y="2" width="18" height="8" rx="2" /><rect x="20" y="4.5" width="2" height="3" rx="0.5" /></svg>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-center z-20 relative py-2">
        <div className="flex items-center gap-1">
          <span className="text-neon text-lg font-bold italic">Swing</span>
          <span className="text-white/50 text-lg italic font-light">Lab</span>
        </div>
      </div>

      {/* Instruction */}
      <p className="text-center text-white text-sm z-20 relative pb-3">
        Center hitter inside frame
      </p>

      {/* Camera Viewfinder */}
      <div className="flex-1 px-6 flex items-center justify-center z-10 relative">
        {/* Camera area with corner brackets */}
        <div className="relative w-full max-w-[85vw] aspect-square">
          {/* Simulated camera feed */}
          <div className="absolute inset-0 rounded-lg overflow-hidden">
            <div className={`w-full h-full ${cameraFacing === "back" ? "bg-gradient-to-br from-gray-800 via-green-900 to-amber-900" : "bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900"}`}>
              {/* Simulated field */}
              <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-amber-900/60 to-transparent" />
              <div className="absolute bottom-[25%] left-[10%] right-[10%] h-[5%] bg-gradient-to-r from-amber-700/40 via-white/20 to-amber-700/40 rounded" />
              {/* Simulated batter silhouette */}
              <div className="absolute bottom-[20%] left-1/2 -translate-x-1/2 w-12 h-20">
                <div className="w-8 h-8 rounded-full bg-gray-800 mx-auto" />
                <div className="w-10 h-16 bg-gray-800 mx-auto rounded-t-lg" />
                <div className="flex justify-center gap-1 mt-1">
                  <div className="w-2 h-8 bg-gray-700 rounded" />
                  <div className="w-2 h-8 bg-gray-700 rounded" />
                </div>
              </div>
            </div>
          </div>

          {/* Corner brackets */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
            <path d="M5 20 V5 H20" stroke="#C8F000" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M95 20 V5 H80" stroke="#C8F000" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M5 80 V95 H20" stroke="#C8F000" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M95 80 V95 H80" stroke="#C8F000" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>

          {/* Semi-opaque mask outside reticle */}
          <div className="absolute inset-0 pointer-events-none" style={{
            boxShadow: "inset 0 0 0 9999px rgba(0,0,0,0.5), 0 0 0 2px rgba(200,240,0,0.3)",
            clipPath: "inset(0)",
          }} />

          {/* Recording pulse overlay */}
          {recording && (
            <div className="absolute inset-0 border-2 border-red-500/50 rounded-lg animate-pulse" />
          )}

          {/* Timer during recording */}
          {recording && (
            <div className="absolute top-2 right-2 bg-black/70 rounded-full px-2 py-0.5 text-xs text-red-400 font-mono">
              {timer.toFixed(1)}s
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="flex items-center justify-around px-8 py-6 z-20 relative">
        {/* Cancel */}
        <button onClick={() => router.push("/")} className="text-white text-base font-light min-w-[60px]">Cancel</button>

        {/* Record Button */}
        <div className="relative">
          {recording ? (
            <button
              onClick={stopRecording}
              className="w-[74px] h-[74px] rounded-full bg-red-500 border-4 border-white/30 flex items-center justify-center active:scale-95 transition-transform"
            >
              <div className="w-7 h-7 bg-white rounded-sm" />
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="w-[74px] h-[74px] rounded-full bg-[#e8404e] border-[5px] border-[#2a2a2a] active:scale-95 transition-transform"
            />
          )}
        </div>

        {/* Flip Camera */}
        <button onClick={flipCamera} className="min-w-[60px] flex justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
        </button>
      </div>

      {/* Home indicator */}
      <div className="flex justify-center pb-1">
        <div className="w-[134px] h-[5px] bg-white/30 rounded-full" />
      </div>
    </div>
  );
}
