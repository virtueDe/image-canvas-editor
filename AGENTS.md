# Repository Guidelines

|IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for repo tasks. Read package.json, README.md, and target source files before relying on framework memory.
|Root:./
|Workspace:apps/web-vue:{src/App.vue,src/main.ts,package.json,vite.config.ts,uno.config.ts}|editor/core:{src/editor.ts,src/renderer.ts,src/image-processing.ts,src/store.ts,src/types.ts,package.json}|editor/vue3:{src/useImageEditor.ts,src/index.ts,package.json}
|Config:./:{package.json,pnpm-workspace.yaml,tsconfig.base.json,README.md}|Output:dist/
|Layers:web-vue=UI shell|editor-vue=Vue bridge|editor-core=editor state+render+persistence
|Boundaries:browser UI/file input/alert only in apps/web-vue|reactive bridge only in editor/vue3|Canvas logic/state/draft/export only in editor/core
|Change Rules:small reversible patches|do not edit dist directly|do not add abstractions/state libs without a current pain point
|Dev:pnpm install|pnpm dev|pnpm build|pnpm preview|pnpm typecheck
|Tests:prefer editor/core/src/*.test.ts for new unit tests; keep UI-free where possible
|Commits:Conventional Commits type(scope): summary|Scopes:{editor-core,editor-vue,web-vue}
|PR:include motivation, impact, validation; UI changes require screenshot/video; state/draft/export changes require compatibility+rollback note
|OnDemandSkill:.codex/skills/repo-doc-maintainer:{SKILL.md,references/doc-maintenance.md}
