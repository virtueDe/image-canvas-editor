import { defineConfig, presetUno } from 'unocss';

export default defineConfig({
  presets: [presetUno()],
  shortcuts: {
    panel:
      'rounded-4 border border-[color:var(--studio-border)] bg-[color:var(--studio-surface-1)] shadow-[var(--studio-shadow)] backdrop-blur',
    'panel-title': 'text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--studio-ink-muted)]',
    'input-range': 'h-2 w-full cursor-pointer appearance-none rounded-full bg-[color:var(--studio-track)]',
    'btn-base':
      'inline-flex items-center justify-center gap-2 rounded-3 px-3 py-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--studio-accent)]/40 disabled:cursor-not-allowed disabled:opacity-50',
    'btn-soft':
      'btn-base border border-[color:var(--studio-border)] bg-[color:var(--studio-surface-2)] text-[color:var(--studio-ink)] hover:border-[color:var(--studio-accent)]/40 hover:bg-[color:var(--studio-surface-3)]',
    'btn-primary':
      'btn-base bg-[color:var(--studio-accent)] text-[color:var(--studio-accent-ink)] shadow-[0_12px_24px_rgba(231,192,136,0.28)] hover:bg-[color:var(--studio-accent-strong)]',
    'btn-danger': 'btn-base bg-rose-500 text-white hover:bg-rose-400',
  },
});
