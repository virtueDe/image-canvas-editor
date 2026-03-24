---
name: repo-doc-maintainer
description: Maintain repository docs, contributor rules, and compressed AGENTS.md for image-canvas-editor. Use when editing AGENTS.md, contributor guidance, manual QA checklists, or deciding what must stay in passive repo context versus move to on-demand references.
---

# Repo Doc Maintainer

## Workflow

1. Read `../../README.md`, `../../package.json`, and affected workspace package files before editing docs.
2. Keep `../../AGENTS.md` passive and minimal: paths, commands, boundaries, verification, commit/PR rules.
3. Move explanations, examples, maintenance process, and long checklists to `references/doc-maintenance.md`.
4. When compressing `../../AGENTS.md`, follow `../../CLAUDE.md-压缩指南.md`: start with `|IMPORTANT`, prefer `|Category:path:{files}` or dense command lines, avoid prose and code fences.
5. After edits, verify every referenced path and command still exists.

## Read As Needed

- `references/doc-maintenance.md`
- `../../CLAUDE.md-压缩指南.md`
