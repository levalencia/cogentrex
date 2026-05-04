'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface ImageLightboxProps {
  imageUrl: string | null;
  onClose: () => void;
}

export function ImageLightbox({ imageUrl, onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((prev) => {
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      return Math.max(0.3, Math.min(5, prev + delta));
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: position.x, py: position.y };
  }, [scale, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPosition({ x: dragStart.current.px + dx, y: dragStart.current.py + dy });
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(5, s + 0.3));
      if (e.key === '-') setScale((s) => Math.max(0.3, s - 0.3));
      if (e.key === '0') { setScale(1); setPosition({ x: 0, y: 0 }); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Controls */}
      <div className="absolute top-4 left-1/2 z-[101] flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-line bg-panel/90 px-4 py-2 shadow-lg">
        <button onClick={() => setScale((s) => Math.min(5, s + 0.3))} className="rounded-lg border border-line px-3 py-1 text-sm text-slate-300 hover:text-white">🔍+</button>
        <button onClick={() => setScale((s) => Math.max(0.3, s - 0.3))} className="rounded-lg border border-line px-3 py-1 text-sm text-slate-300 hover:text-white">🔍-</button>
        <span className="min-w-[60px] text-center text-xs text-slate-400">{Math.round(scale * 100)}%</span>
        <button onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }} className="rounded-lg border border-line px-3 py-1 text-sm text-slate-300 hover:text-white">Reset</button>
        <a href={imageUrl} download className="rounded-lg border border-line px-3 py-1 text-sm text-slate-300 hover:text-white" target="_blank" rel="noopener noreferrer">⬇ Download</a>
        <button onClick={onClose} className="rounded-lg border border-line px-3 py-1 text-sm text-red-300 hover:text-red-200">Close</button>
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className="flex h-full w-full items-center justify-center overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default' }}
      >
        <img
          src={imageUrl}
          alt="Preview"
          className="max-h-[90vh] max-w-[90vw] object-contain transition-transform"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: dragging ? 'none' : 'transform 0.15s ease-out',
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}
