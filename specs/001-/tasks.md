# Tasks: 按包结构生成构建产物

**Input**: Design documents from `C:/code/virtueDe/image-canvas-editor/specs/001-/`
**Prerequisites**: `plan.md`（required）, `research.md`, `data-model.md`, `contracts/build-output-contract.yaml`, `quickstart.md`

## Execution Flow (main)
```
1. 读取 plan.md
   → 已确认技术栈是 pnpm workspace + TypeScript + Vue 3 + Vite
2. 读取可选设计文档
   → data-model.md 提供 3 个构建域实体
   → contracts/build-output-contract.yaml 提供 1 个 CLI/构建输出契约
   → research.md 提供 4 个关键设计决策
   → quickstart.md 提供 3 个验收场景
3. 生成任务
   → Setup：环境与测试入口
   → Tests：1 个契约测试 + 3 个集成测试
   → Core：3 个实体模型 + 验证/镜像/编排脚本 + 3 个包构建配置
   → Integration：根构建入口接线
   → Polish：单元测试、文档、quickstart 验证
4. 应用并行规则
   → 不同文件标记 [P]
   → 同一文件保持串行
5. 顺序化依赖
   → Setup → Tests → Models → Build scripts/config → Root integration → Polish
6. 输出 tasks.md
```

## Format: `[ID] [P?] Description`
- **[P]**: 可并行执行（不同文件、无依赖冲突）
- 每个任务都包含精确文件路径，默认相对仓库根目录

## Path Conventions
- 根配置：`package.json`, `.nvmrc`
- 构建脚本：`scripts/build-output/`
- 契约测试：`tests/contract/`
- 集成测试：`tests/integration/`
- 单元测试：`tests/unit/`
- 包配置：`apps/web-vue/`, `editor/core/`, `editor/vue3/`

## Phase 3.1: Setup
- [ ] T001 在 `package.json` 与 `.nvmrc` 中声明本仓库支持的 Node.js 版本，并新增 `test:contract-build`、`test:integration-build`、`test:unit-build` 命令，为构建输出验证提供统一入口。
- [ ] T002 在 `tests/helpers/build-output-assertions.mjs` 中实现通用断言工具：目录存在性、必需文件检查、目录快照对比、失败退出码断言。

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: 这些测试必须先写出来，并且在实现前处于失败状态。**
- [ ] T003 [P] 在 `tests/contract/build-output-contract.test.mjs` 中根据 `specs/001-/contracts/build-output-contract.yaml` 编写契约测试，校验根构建、单包构建和失败信号 3 类 CLI 行为。
- [ ] T004 [P] 在 `tests/integration/full-build-layout.test.mjs` 中编写主成功路径测试：执行 `pnpm build` 后验证 `apps/web-vue/dist`、`editor/core/dist`、`editor/vue3/dist` 与根 `dist` 的产物布局。
- [ ] T005 [P] 在 `tests/integration/package-rebuild-isolation.test.mjs` 中编写边界场景测试：仅执行 `pnpm --filter @image-canvas-editor/editor-core build`，验证其他包产物目录与根 `dist` 未被删除或清空。
- [ ] T006 [P] 在 `tests/integration/missing-artifact-failure.test.mjs` 中编写失败场景测试：模拟库包缺失脚本或 `.d.ts` 后，验证构建返回非 0 且不误报成功。

## Phase 3.3: Core Implementation (ONLY after tests are failing)
- [ ] T007 [P] 在 `scripts/build-output/workspace-packages.mjs` 中落地 `WorkspacePackage` 模型，显式声明 3 个 workspace 包的包名、包路径、包类型、规范输出目录、兼容输出目录与依赖顺序。
- [ ] T008 [P] 在 `scripts/build-output/artifact-set-rules.mjs` 中落地 `ArtifactSet` 模型，声明每个包的必需脚本、类型声明、HTML 入口和静态资源校验规则。
- [ ] T009 [P] 在 `scripts/build-output/output-layout-rules.mjs` 中落地 `OutputLayoutRule` 模型，声明各包的清理范围、规范产物目录和根 `dist` 兼容镜像规则。
- [ ] T010 在 `scripts/build-output/verify-build-output.mjs` 中实现统一构建校验器，消费 T007-T009 的模型，对目标包或全量构建执行产物完整性校验并在失败时返回非 0。
- [ ] T011 [P] 在 `editor/core/package.json`、`editor/core/vite.config.ts`、`editor/core/tsconfig.build.json` 中实现 `@image-canvas-editor/editor-core` 的库构建：输出 `editor/core/dist/index.js` 与 `editor/core/dist/index.d.ts`，并把包导出指向 `dist`。
- [ ] T012 [P] 在 `editor/vue3/package.json`、`editor/vue3/vite.config.ts`、`editor/vue3/tsconfig.build.json` 中实现 `@image-canvas-editor/editor-vue` 的库构建：输出 `editor/vue3/dist/index.js` 与 `editor/vue3/dist/index.d.ts`，并把包导出指向 `dist`。
- [ ] T013 [P] 在 `apps/web-vue/package.json` 与 `apps/web-vue/vite.config.ts` 中把应用的规范产物目录改为 `apps/web-vue/dist`，确保单包构建只清理自己的输出目录。
- [ ] T014 [P] 在 `scripts/build-output/mirror-web-dist.mjs` 中实现根 `dist` 兼容镜像脚本，把 `apps/web-vue/dist` 同步到仓库根 `dist`，且禁止混入两个库包的规范产物。
- [ ] T015 在 `scripts/build-output/run-workspace-build.mjs` 中实现全量构建编排：按 `editor/core → editor/vue3 → web-vue → mirror → verify` 的顺序驱动 3 个包构建并在任一步失败时中断。

## Phase 3.4: Integration
- [ ] T016 在 `package.json` 中把根 `build` 命令切换为 `scripts/build-output/run-workspace-build.mjs`，并把 `test:contract-build`、`test:integration-build`、`test:unit-build` 接入新的构建校验脚本。
- [ ] T017 在 `editor/core/package.json`、`editor/vue3/package.json`、`apps/web-vue/package.json` 中把各自 `build` 命令接到统一校验流程：库包构建后调用 `verify-build-output.mjs --package <pkg>`，应用包构建后调用 `mirror-web-dist.mjs` 与 `verify-build-output.mjs --package @image-canvas-editor/web-vue`。

## Phase 3.5: Polish
- [ ] T018 [P] 在 `tests/unit/build-output-models.test.mjs` 中为 `scripts/build-output/workspace-packages.mjs`、`artifact-set-rules.mjs`、`output-layout-rules.mjs` 补充单元测试，确认 3 个模型与设计文档一致。
- [ ] T019 [P] 在 `tests/unit/verify-build-output.test.mjs` 中为 `scripts/build-output/verify-build-output.mjs` 的成功/失败分支补充单元测试，覆盖缺失脚本、缺失 `.d.ts`、错误兼容镜像等情况。
- [ ] T020 [P] 更新 `README.md`，补充新的全量构建命令、单包构建命令、4 个输出目录的职责，以及根 `dist` 与 `apps/web-vue/dist` 的兼容关系。
- [ ] T021 按 `specs/001-/quickstart.md` 执行验收：跑通主成功路径、单包重建边界场景、失败场景，并把发现的问题回填到实现分支修复后再次验证。

## Dependencies
- T001-T002 完成后，才能开始 T003-T006。
- T003-T006 必须先写并确认失败，才能开始 T007-T017。
- T007-T009 是 T010 的前置。
- T010 是 T017 的前置。
- T011-T014 可以并行，但都必须在 T015 前完成。
- T015 与 T017 完成后，才能进入 T018-T021。
- T021 依赖 T016-T020 全部完成。

## Parallel Example
```text
# 先并行写测试
Task: "T003 在 tests/contract/build-output-contract.test.mjs 中编写构建输出契约测试"
Task: "T004 在 tests/integration/full-build-layout.test.mjs 中编写全量构建布局测试"
Task: "T005 在 tests/integration/package-rebuild-isolation.test.mjs 中编写单包重建隔离测试"
Task: "T006 在 tests/integration/missing-artifact-failure.test.mjs 中编写缺失产物失败测试"

# 再并行落地 3 个构建域模型
Task: "T007 在 scripts/build-output/workspace-packages.mjs 中声明 3 个 workspace 包模型"
Task: "T008 在 scripts/build-output/artifact-set-rules.mjs 中声明产物完整性规则"
Task: "T009 在 scripts/build-output/output-layout-rules.mjs 中声明输出布局与清理边界"

# 再并行落地 3 个包的构建配置与兼容镜像
Task: "T011 在 editor/core/package.json、editor/core/vite.config.ts、editor/core/tsconfig.build.json 中实现 editor-core 库构建"
Task: "T012 在 editor/vue3/package.json、editor/vue3/vite.config.ts、editor/vue3/tsconfig.build.json 中实现 editor-vue 库构建"
Task: "T013 在 apps/web-vue/package.json、apps/web-vue/vite.config.ts 中实现 web-vue 规范输出目录"
Task: "T014 在 scripts/build-output/mirror-web-dist.mjs 中实现根 dist 兼容镜像"

# 最后并行补 polish
Task: "T018 在 tests/unit/build-output-models.test.mjs 中补充构建域模型单元测试"
Task: "T019 在 tests/unit/verify-build-output.test.mjs 中补充构建校验器单元测试"
Task: "T020 更新 README.md 说明新的构建输出布局"
```

## Notes
- 本特性没有 HTTP API；`contracts/build-output-contract.yaml` 描述的是 **CLI / 构建输出契约**，因此实现任务落在构建脚本与包配置，而不是 REST endpoint。
- `[P]` 任务只在文件集合完全不重叠时使用；任何会同时修改 `package.json` 的任务都保持串行。
- `editor/core`、`editor/vue3` 必须同时产出脚本文件和类型声明；少一样都算失败。
- 根 `dist` 是兼容出口，不是新的共享产物垃圾桶；不要把两个库包的规范产物复制进去。

## Task Generation Rules
*Applied during main() execution*

1. **From Contracts**:
   - `contracts/build-output-contract.yaml` → T003 契约测试
   - 3 个 CLI 接口（`root-build`、`package-build`、`build-failure-signals`）→ T010、T014、T015、T016、T017 实现任务

2. **From Data Model**:
   - `WorkspacePackage` → T007
   - `ArtifactSet` → T008
   - `OutputLayoutRule` → T009

3. **From User Stories / Quickstart**:
   - 主成功路径 → T004
   - 单包重建边界场景 → T005
   - 缺失产物失败场景 → T006
   - Quickstart 全量验收 → T021

4. **Ordering**:
   - Setup → Tests → Models → Build scripts/config → Integration → Polish
   - 同文件串行，不同文件并行

## Validation Checklist
*GATE: Checked by main() before returning*

- [x] All contracts have corresponding tests
- [x] All entities have model tasks
- [x] All tests come before implementation
- [x] Parallel tasks truly independent
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
