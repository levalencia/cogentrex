'use client';

import type { ImageGenerationOptions } from '@cogentrex/shared';

interface ImageOptionsPanelProps {
  options: ImageGenerationOptions;
  onChange: (options: ImageGenerationOptions) => void;
}

const SIZES = [
  { value: '1024x1024', label: 'Square (1024×1024)' },
  { value: '1536x1024', label: 'Landscape (1536×1024)' },
  { value: '1024x1536', label: 'Portrait (1024×1536)' },
  { value: '2048x2048', label: '2K Square (2048×2048)' },
  { value: '2048x1152', label: '2K Landscape (2048×1152)' },
  { value: '3840x2160', label: '4K Landscape (3840×2160)' },
  { value: '2160x3840', label: '4K Portrait (2160×3840)' },
];

const QUALITIES = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export function ImageOptionsPanel({ options, onChange }: ImageOptionsPanelProps) {
  function update<K extends keyof ImageGenerationOptions>(key: K, value: ImageGenerationOptions[K]) {
    onChange({ ...options, [key]: value });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-ink/30 px-3 py-2 text-xs text-slate-300">
      <span className="text-slate-500">Options:</span>

      <label className="flex items-center gap-1.5">
        <span>Size</span>
        <select
          value={options.size ?? '1024x1024'}
          onChange={(e) => update('size', e.target.value)}
          className="rounded-lg border border-line bg-ink px-2 py-1 text-xs text-white outline-none focus:border-accent"
        >
          {SIZES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5">
        <span>Quality</span>
        <select
          value={options.quality ?? 'auto'}
          onChange={(e) => update('quality', e.target.value as ImageGenerationOptions['quality'])}
          className="rounded-lg border border-line bg-ink px-2 py-1 text-xs text-white outline-none focus:border-accent"
        >
          {QUALITIES.map((q) => (
            <option key={q.value} value={q.value}>{q.label}</option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5">
        <span>Count</span>
        <input
          type="number"
          min={1}
          max={4}
          value={options.n ?? 1}
          onChange={(e) => update('n', Math.max(1, Math.min(4, Number(e.target.value))))}
          className="w-12 rounded-lg border border-line bg-ink px-2 py-1 text-xs text-white outline-none focus:border-accent"
        />
      </label>
    </div>
  );
}
