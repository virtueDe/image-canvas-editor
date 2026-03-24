# Implementation Plan: 按包结构生成构建产物

**Branch**: `[001-]` | **Date**: 2026-03-24 | **Spec**: `C:/code/virtueDe/image-canvas-editor/specs/001-/spec.md`
**Input**: Feature specification from `C:/code/virtueDe/image-canvas-editor/specs/001-/spec.md`

## Execution Flow (/plan command scope)
```
1. 读取 feature spec 与仓库最小上下文
   → 已确认 3 个 workspace 包都必须产生产物，且根 dist/ 需要继续兼容
2. 填充 Technical Context
   → 以 package.json、pnpm-lock.yaml、vite.config.ts、tsconfig.json 为事实来源
3. 填充 Constitution Check
   → .specify/memory/constitution.md 仍是占位模板，只能退化为仓库显式约束检查
4. 执行 Phase 0
   → 产出 research.md，收敛产物布局、库包构建方式、兼容策略
5. 执行 Phase 1
   → 产出 data-model.md、contracts/build-output-contract.yaml、quickstart.md
6. 重新检查约束
   → 当前设计未引入新构建工具，也未破坏根 dist/ 兼容
7. 规划 Phase 2
   → 仅描述 /tasks 如何生成任务，不创建 tasks.md
8. STOP
   → 当前规划已完成，可进入 /tasks
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
本特性要把当前“只产出根 `dist/` 的单应用构建”改成“3 个 workspace 包各自产出独立构建结果”，同时不打断现有依赖根 `dist/` 的流程。最小可行方向是：为 `apps/web-vue`、`editor/core`、`editor/vue3` 各自定义包级构建输出；其中应用包保留 `apps/web-vue/dist/` 作为规范产物，并把根 `dist/` 作为对 `apps/web-vue/dist/` 的兼容出口；两个库包输出 ESM 脚本与类型声明，且单包构建不得清空其他包的产物目录。

## Technical Context
**Language/Version**: TypeScript 5.9.3（`pnpm-lock.yaml`），Vue 3.5.30，Vite 4.5.14；Node.js 版本仓库未显式声明  
**Primary Dependencies**: pnpm workspace、Vite、Vue 3、UnoCSS、TypeScript；`@image-canvas-editor/editor-core` 与 `@image-canvas-editor/editor-vue` 通过 workspace 依赖相互消费  
**Storage**: 文件系统构建产物（根 `dist/` 与各包 `dist/`）；运行时本地草稿存储存在于浏览器，但不属于本特性改动范围  
**Testing**: 已存在 `pnpm typecheck`（根脚本实际过滤到 `apps/web-vue`）；仓库内未发现 Vitest/Jest 等专用测试配置；本特性需要以构建结果检查 + 手工 smoke 为主  
**Target Platform**: Node.js 构建环境 + 浏览器交付的 Vue Web 应用  
**Project Type**: pnpm workspace monorepo（1 个 Web 应用包 + 2 个可复用库包）  
**Performance Goals**: 构建结果必须按包隔离；单包重建不得误删其他包产物；根 `dist/` 继续作为兼容出口；仓库暂无量化的构建耗时/体积指标  
**Constraints**: 不新增新的打包工具；不破坏现有 workspace 消费关系；`editor/core` 与 `editor/vue3` 至少输出脚本文件和类型声明；`/plan` 阶段不得创建 `tasks.md`  
**Scale/Scope**: 仅覆盖 3 个 workspace 包（`apps/web-vue`、`editor/core`、`editor/vue3`）及其根级构建编排、包级输出目录和兼容复制策略

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` 仍是占位模板（原则名、治理规则、版本号均未落地），**无法做强约束校验**。本次只能退化为仓库显式规则检查：

- [x] **最小改动**：规划只围绕构建脚本、构建配置、产物布局与验证路径，不扩展业务能力。
- [x] **不破坏兼容**：明确保留根 `dist/`，并把它定义为 `apps/web-vue/dist/` 的兼容出口。
- [x] **边界清晰**：UI 壳仍属于 `apps/web-vue`，编辑器内核与 Vue 适配层的产物分别由各自包负责。
- [x] **复用现有技术栈**：继续使用 pnpm + Vite + TypeScript，不新增 tsup/rollup 配置层或发布工具。
- [x] **计划边界受控**：本次只生成 `plan.md`、`research.md`、`data-model.md`、`contracts/`、`quickstart.md`，不生成 `tasks.md`，不改业务代码。

## Project Structure

### Documentation (this feature)
```
specs/001-/
├── plan.md                       # 本文件 (/plan command output)
├── research.md                   # Phase 0 output (/plan command)
├── data-model.md                 # Phase 1 output (/plan command)
├── quickstart.md                 # Phase 1 output (/plan command)
├── contracts/
│   └── build-output-contract.yaml
└── tasks.md                      # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.base.json
README.md

apps/
└── web-vue/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── src/
        ├── App.vue
        ├── env.d.ts
        ├── main.ts
        └── styles.css

editor/
├── core/
│   ├── package.json
│   └── src/
│       ├── editor.ts
│       ├── image-processing.ts
│       ├── index.ts
│       ├── persistence.ts
│       ├── presets.ts
│       ├── renderer.ts
│       ├── store.ts
│       ├── types.ts
│       └── utils.ts
└── vue3/
    ├── package.json
    └── src/
        ├── index.ts
        └── useImageEditor.ts
```

**Structure Decision**: 当前仓库是一个前端 monorepo，而不是“单项目/前后端分离/移动端 API”模板。实现阶段应只在根构建编排、3 个包的构建脚本与构建配置文件上落子；业务源码目录保持不动。

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - 决定“规范产物目录”是包内 `dist/` 还是根 `dist/` 镜像树
   - 决定两个库包如何在不引入新工具的前提下同时产出 ESM 脚本与 `.d.ts`
   - 决定根 `dist/` 的兼容策略如何与单包重建共存

2. **Generate and dispatch research agents**:
   ```
   本次没有派生外部 research agents。
   仓库已有的 package.json、vite.config.ts、tsconfig.json、README.md 足以收敛关键设计决策。
   研究结论已直接整理到 research.md。
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: 规范产物采用“包内 dist + 根 dist 兼容出口”
   - Rationale: 目录天然映射回包路径，且单包重建不会误清空其他包
   - Alternatives considered: 根 `dist/` 镜像整棵包树、继续只保留根 `dist/`

**Output**: `research.md` 已完成，且不存在阻断 Phase 1 的设计未知项

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - 使用轻量“构建域模型”描述 Workspace 包、产物集合、输出布局规则
   - 明确库包的必需文件、应用包的兼容出口、单包清理边界

2. **Generate API contracts** from functional requirements:
   - 本特性不新增运行时 REST/GraphQL 接口
   - 需要新增 **CLI/构建输出契约**，定义根构建、包级构建、兼容出口与失败条件
   - 输出到 `contracts/build-output-contract.yaml`

3. **Generate contract tests** from contracts:
   - `/plan` 不创建测试文件
   - `/tasks` 阶段将基于契约生成“构建结果校验”和“单包重建不互删”的验证任务

4. **Extract test scenarios** from user stories:
   - 主成功路径：一次构建产出 3 个包的独立结果，且根 `dist/` 仍可用
   - 边界场景：只重建一个包时，其他包产物保持不变
   - 失败场景：库包缺少脚本或类型声明时，构建必须失败

5. **Update agent file incrementally** (O(1) operation):
   - 在设计产物写入后，严格执行 `.specify/scripts/bash/update-agent-context.sh codex`
   - 若脚本失败，仅记录失败原因，不回滚已生成的规划文档
   - 本次仅允许增量更新 agent 上下文，不得借机改业务代码

**Output**: `data-model.md`、`contracts/build-output-contract.yaml`、`quickstart.md`，以及更新后的 agent context

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- 读取 `.specify/templates/tasks-template.md` 作为基底
- 先生成根构建编排任务：让 `pnpm build` 能按依赖顺序驱动 3 个包
- 再生成包级构建任务：为 `apps/web-vue`、`editor/core`、`editor/vue3` 各自补齐 build 脚本与输出目录
- 基于契约生成验证任务：检查库包脚本 + `.d.ts`、检查根 `dist/` 兼容出口、检查单包构建不清理其他包
- 基于 quickstart 生成手工/自动验证任务，但 `/tasks` 才会真正写入 `tasks.md`

**Ordering Strategy**:
- 先根后包：先定义根级编排，再落地各包构建配置
- 先库后应用：先稳定 `editor/core` / `editor/vue3` 产物，再处理 `apps/web-vue` 和根 `dist/` 兼容复制
- 先契约后实现：先写构建校验任务，再写配置实现任务
- 将互不冲突的配置文件修改标记为 `[P]` 并行任务

**Estimated Output**: `/tasks` 预计会生成 10-14 个有序任务，覆盖根脚本、包级构建配置、兼容出口和验证步骤

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, verify build artifacts and compatibility output)

## Complexity Tracking
无。当前方案复用现有 pnpm workspace + Vite + TypeScript 组合，没有引入新的构建层、发布层或额外抽象。

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS（仅基于仓库显式约束；宪章模板未落地）
- [x] Post-Design Constitution Check: PASS（同上）
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented

---
*Based on Constitution template at `/.specify/memory/constitution.md` (placeholder, not a ratified repository constitution)*
