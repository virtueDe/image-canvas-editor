# Research: 按包结构生成构建产物

## Decision 1
**Decision**: 把“包内 `dist/`”定义为规范产物位置：`apps/web-vue/dist/`、`editor/core/dist/`、`editor/vue3/dist/`；根 `dist/` 仅保留为 `apps/web-vue/dist/` 的兼容出口。  
**Rationale**: 这让产物路径天然映射回包路径，避免把 3 个包重新揉进一个共享目录。单包重建时，每个包只清理自己的 `dist/`，不会误删其他包产物；同时旧流程仍可继续读取根 `dist/`。  
**Alternatives considered**:
- 在根 `dist/` 下镜像整棵 `apps/` 与 `editor/` 目录：能体现包结构，但会引入额外复制层，还要同时处理根 `index.html` 兼容，复杂度更高。
- 继续只保留根 `dist/`：最省事，但不满足“3 个包各自产物”的核心需求，也无法解决产物混在一起的问题。

## Decision 2
**Decision**: 两个库包采用“现有工具链复用”方案：使用 Vite 的 library mode 负责脚本产物，使用 TypeScript 的 declarations-only 构建负责 `.d.ts`。  
**Rationale**: 仓库已经依赖 Vite、TypeScript，且两个库包都声明了 `"type": "module"`，当前消费方式也围绕 ESM 展开。继续复用现有工具链最符合“最小必要”，不需要再引入 tsup、额外 rollup 配置层或发布工具。  
**Alternatives considered**:
- 只用 `tsc`：可以产出类型声明，但对脚本产物的入口与打包控制不足，不适合统一库输出。
- 引入 tsup/新打包器：功能上可行，但会无端增加依赖、配置心智和维护成本。

## Decision 3
**Decision**: 根 `pnpm build` 从“只构建 `@image-canvas-editor/web-vue`”升级为“编排 3 个包的构建”；同时为每个包提供独立 `build` 脚本，保证单包重建只影响自己的规范产物。  
**Rationale**: 这是满足 FR-003、FR-004、FR-006、FR-007 的最直接办法。根构建解决“一次标准构建获得全部产物”，包级构建解决“单包重建不覆盖其他包”。  
**Alternatives considered**:
- 继续让根脚本只跑 web 应用构建，再手工补库包产物：容易漂移，且不可验证。
- 每次单包重建后再跑一次全量根构建：虽然简单，但会重新清空根兼容出口，无法满足边界场景。

## Decision 4
**Decision**: 根 `dist/` 的兼容出口应只承载 web 应用兼容物，不承载两个库包的规范产物。  
**Rationale**: README 明确“生产构建仍输出到根目录 `dist/`”，对应的是当前 Vite web 应用行为，而不是库发布目录。把库包也塞进根 `dist/` 会重新引入混合产物，等于把问题换了个目录名继续保留。  
**Alternatives considered**:
- 把库包产物也复制到根 `dist/`：短期看方便，长期会让兼容出口再次变成杂物间。
- 完全取消根 `dist/`：直接破坏现有流程，不可接受。

## Research outcome
本次规划没有额外阻塞性研究议题。唯一未由仓库显式声明的是 Node.js 版本，但它不影响本次构建布局和契约设计，可在 `/tasks` 阶段作为环境确认任务处理。
