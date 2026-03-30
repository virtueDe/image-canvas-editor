import { defineConfig, presetUno } from 'unocss';

export default defineConfig({
  presets: [presetUno()],
  shortcuts: {
    'workbench-frame': 'border border-[color:var(--studio-border)] bg-[color:var(--studio-surface-1)] shadow-[var(--studio-shadow-soft)]',
    'workbench-panel': 'workbench-frame rounded-[28px]',
    'panel-title': 'text-sm font-semibold tracking-[0.08em] text-[color:var(--studio-ink-muted)]',
    'status-pill':
      'inline-flex items-center rounded-full border border-[color:var(--studio-border)] bg-[color:var(--studio-surface-2)] px-2 py-1 text-[11px] font-medium text-[color:var(--studio-ink-muted)]',
    'input-range': 'h-2 w-full cursor-pointer appearance-none rounded-full bg-[color:var(--studio-track)]',
    'btn-base':
      'inline-flex items-center justify-center gap-2 rounded-3 px-3 py-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--studio-accent-ring-strong)] disabled:cursor-not-allowed disabled:opacity-50',
    'btn-soft':
      'btn-base border border-[color:var(--studio-border)] bg-[color:var(--studio-surface-2)] text-[color:var(--studio-ink)] hover:border-[color:var(--studio-border-strong)] hover:bg-[color:var(--studio-surface-3)]',
    'btn-primary':
      'btn-base bg-[color:var(--studio-accent)] text-[color:var(--studio-accent-ink)] shadow-[var(--studio-accent-shadow)] hover:bg-[color:var(--studio-accent-strong)]',
    'btn-danger': 'btn-base bg-rose-500 text-white hover:bg-rose-400',
    'workbench-icon-btn': 'inline-flex items-center gap-2 whitespace-nowrap',
    'header-action-btn': 'btn-soft workbench-icon-btn',
    'header-primary-btn': 'btn-primary workbench-icon-btn',
    'theme-toggle-btn': 'header-action-btn min-w-0 justify-between px-3',
    'mobile-toggle-btn': 'btn-soft px-3 py-2 text-xs',
    'mini-action-btn': 'btn-soft px-2 py-1 text-xs',
  },
});
