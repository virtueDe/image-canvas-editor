import { defineConfig, presetUno } from 'unocss';

export default defineConfig({
  presets: [presetUno()],
  shortcuts: {
    'panel': 'rounded-4 border border-white/10 bg-white/6 shadow-[0_20px_60px_rgba(15,23,42,0.35)] backdrop-blur',
    'panel-title': 'text-sm font-semibold text-slate-100 tracking-wide',
    'input-range': 'h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700/60',
    'btn-base': 'inline-flex items-center justify-center rounded-3 px-3 py-2 text-sm font-medium transition',
    'btn-soft': 'btn-base border border-white/10 bg-slate-800/70 text-slate-100 hover:border-cyan-400/50 hover:bg-slate-700/80',
    'btn-primary': 'btn-base bg-cyan-500 text-slate-950 hover:bg-cyan-400',
    'btn-danger': 'btn-base bg-rose-500 text-white hover:bg-rose-400'
  },
});
