# Data Model: 按包结构生成构建产物

> 本特性不引入新的业务领域模型；这里记录的是**构建域模型**，用于约束包、产物和输出布局。

## Entity: WorkspacePackage

| 字段 | 类型 | 说明 | 约束 |
|---|---|---|---|
| `packageName` | string | workspace 包名 | 全局唯一；必须与 `package.json.name` 一致 |
| `packagePath` | path | 包在仓库中的相对路径 | 全局唯一；当前只允许 `apps/web-vue`、`editor/core`、`editor/vue3` |
| `packageType` | enum | `app` / `library` | 决定产物类别与校验规则 |
| `buildEntry` | path | 构建入口 | 必须存在且可解析 |
| `canonicalOutDir` | path | 规范产物目录 | 每个包独占，不得与其他包重叠 |
| `compatibilityOutDir` | path \| null | 兼容输出目录 | 仅 `apps/web-vue` 允许为根 `dist/` |
| `workspaceDeps` | string[] | 依赖的 workspace 包 | 依赖顺序决定根构建编排顺序 |

### 当前实例

| packageName | packagePath | packageType | canonicalOutDir | compatibilityOutDir |
|---|---|---|---|---|
| `@image-canvas-editor/web-vue` | `apps/web-vue` | `app` | `apps/web-vue/dist` | `dist` |
| `@image-canvas-editor/editor-core` | `editor/core` | `library` | `editor/core/dist` | `null` |
| `@image-canvas-editor/editor-vue` | `editor/vue3` | `library` | `editor/vue3/dist` | `null` |

## Entity: ArtifactSet

| 字段 | 类型 | 说明 | 约束 |
|---|---|---|---|
| `ownerPackage` | string | 所属 `WorkspacePackage.packageName` | 必填 |
| `scriptFiles` | path[] | 可消费脚本文件 | `library` 至少 1 个；`app` 至少包含主 bundle |
| `typeFiles` | path[] | 类型声明文件 | `library` 至少 1 个；`app` 可选 |
| `assetFiles` | path[] | 静态资源文件 | `app` 常见；`library` 可为空 |
| `htmlEntry` | path \| null | HTML 入口 | 仅 `app` 允许存在 |
| `status` | enum | `planned` / `building` / `ready` / `failed` | 失败时不得标记为可消费 |

### 校验规则

1. `editor/core` 与 `editor/vue3` 的 `ArtifactSet` 必须同时包含脚本文件和类型声明。
2. `apps/web-vue` 的规范产物必须包含 `index.html` 与静态资源目录。
3. 根 `dist/` 若作为兼容出口存在，其内容必须可追溯到 `apps/web-vue/dist/`，不能混入两个库包的规范产物。
4. 一个包的构建失败时，不得把该包的半成品产物标记成 `ready`。

## Entity: OutputLayoutRule

| 字段 | 类型 | 说明 | 约束 |
|---|---|---|---|
| `sourcePackagePath` | path | 来源包路径 | 必须映射到一个 `WorkspacePackage` |
| `canonicalOutDir` | path | 规范输出目录 | 与来源包一一对应 |
| `cleanScope` | path[] | 构建前允许清理的目录集合 | 只能包含当前包的 `canonicalOutDir` |
| `compatibilityMirrorTo` | path \| null | 兼容复制目标 | 仅应用包允许指向根 `dist/` |
| `requiredFiles` | string[] | 产物最小完整性清单 | 用于构建后校验 |

### 关系

- `WorkspacePackage 1 -> 1 ArtifactSet`
- `WorkspacePackage 1 -> 1 OutputLayoutRule`
- `WorkspacePackage N -> N WorkspacePackage`（通过 `workspaceDeps` 表示依赖）

## 状态流转

```text
planned
  ↓ 触发 build
building
  ├─ 产物完整且校验通过 → ready
  └─ 缺少脚本/类型声明/HTML 入口等必要文件 → failed
```

## Data ownership

- 根 `package.json`：拥有 workspace 级 `build` 编排规则
- 各包 `package.json` / `vite.config.*` / `tsconfig.*`：拥有各自 `WorkspacePackage` 的输出定义
- `contracts/build-output-contract.yaml`：拥有跨包一致的外部行为约束

## 非目标

- 不改变编辑器运行时状态模型
- 不新增数据库、缓存或服务端存储
- 不把构建域模型暴露成运行时 API
