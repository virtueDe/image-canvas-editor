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
    'workbench-header': 'mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between',
    'workbench-eyebrow': 'text-xs uppercase tracking-[0.35em] text-[color:var(--studio-accent)]',
    'workbench-title': 'mt-2 text-3xl font-semibold text-[color:var(--studio-ink)] md:text-4xl',
    'workbench-copy': 'mt-2 max-w-3xl text-sm leading-6 text-[color:var(--studio-ink-muted)]',
    'header-actions': 'panel flex flex-wrap items-center gap-2 px-4 py-3',
    'inspector-section': 'panel p-4',
    'inspector-section-header': 'mb-4 flex items-center justify-between',
    'inspector-section-title': 'panel-title',
    'inspector-section-hint': 'text-xs text-[color:var(--studio-ink-dim)]',
    'inspector-section-toggle': 'btn-soft px-2 py-1 text-xs',
    'stage-shell': 'panel flex min-h-[560px] flex-col overflow-hidden md:min-h-[720px]',
    'stage-header':
      'flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--studio-border)] px-4 py-3',
    'stage-title': 'panel-title',
    'stage-subtitle': 'text-xs text-[color:var(--studio-ink-dim)]',
    'stage-toolbar':
      'flex items-center gap-2 rounded-3 bg-[color:var(--studio-surface-3)] px-3 py-2 text-xs text-[color:var(--studio-ink)] shadow-[0_12px_30px_rgba(7,5,3,0.35)]',
    'stage-zoom': 'min-w-[52px] text-center font-semibold text-[color:var(--studio-accent)]',
    'stage-canvas': 'block h-full w-full select-none rounded-4',
    'stage-empty':
      'flex items-center justify-center rounded-4 border border-dashed border-[color:var(--studio-border)] bg-[color:var(--studio-surface-2)] text-center text-sm text-[color:var(--studio-ink-muted)]',
    'stage-empty-title': 'text-base font-semibold text-[color:var(--studio-ink)]',
    'stage-empty-copy': 'mt-2 text-xs leading-5 text-[color:var(--studio-ink-dim)]',
    'stage-hint':
      'pointer-events-none absolute bottom-6 left-6 max-w-[280px] rounded-3 bg-[color:var(--studio-surface-3-alpha)] px-4 py-3 text-sm text-[color:var(--studio-ink-muted)] shadow-[0_12px_30px_rgba(7,5,3,0.35)]',
    'stage-hint-title': 'font-semibold text-[color:var(--studio-ink)]',
    'stage-hint-copy': 'mt-1 text-xs leading-5 text-[color:var(--studio-ink-dim)]',
  },
});
