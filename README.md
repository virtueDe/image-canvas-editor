# image-canvas-editor

一个面向浏览器的图片编辑工作台 Monorepo，基于 `pnpm workspace`、`Vue 3`、`TypeScript`、`UnoCSS` 和 `Canvas 2D` 构建。

这个仓库不追求“把所有逻辑都塞进页面组件里”。它把编辑器拆成三层：`editor/core` 负责状态与渲染，`editor/vue3` 负责响应式桥接，`apps/web-vue` 负责界面壳。这样做的目的很直接：边界清楚、回归更少、以后换 UI 壳也不用把内核一起推倒重来。

## 当前能力

- 本地图片上传
- 90° 快速旋转与任意角度旋转
- 水平 / 垂直翻转
- 裁剪框创建、移动、缩放与应用
- 滤镜预设：原图、黑白、暖色、冷调、复古、淡褪
- 参数调节：对比度、曝光、高光
- 文字覆盖层：内容、字号、颜色、画布内拖拽定位
- 预览视图拖拽平移、滚轮缩放、双击复位
- 撤销 / 重做
- 浏览器本地草稿保存与恢复
- PNG 导出

## 为什么这样拆

先回答三个问题：

1. 这是不是个真问题？是。图片编辑最容易烂掉的地方，就是 UI、Canvas 事件、状态和导出逻辑搅成一团。
2. 有没有更简单的方法？有。把“谁负责状态”“谁负责 Vue”“谁负责浏览器交互”分开，不再靠一堆补丁式 if/else 维持。
3. 会破坏什么吗？当前拆分保留了浏览器本地草稿、兼容根 `dist/` 输出，以及 Web 应用的既有构建入口。

核心思路不是加抽象，而是把责任边界收紧：

| 层级 | 位置 | 职责 | 不该做什么 |
| --- | --- | --- | --- |
| UI 壳 | `apps/web-vue` | 页面布局、按钮组织、主题与交互提示 | 不直接持有编辑器底层状态机 |
| Vue 桥接 | `editor/vue3` | 把类状态映射成 `ref` / `computed`，向 UI 暴露操作方法 | 不处理 Canvas 渲染细节 |
| 编辑内核 | `editor/core` | 编辑状态、历史记录、渲染、草稿持久化、导出 | 不依赖具体 UI 框架 |

## 架构总览

```text
apps/
└─ web-vue/                  # Vue 3 Web 应用壳

editor/
├─ core/                     # 编辑器内核：状态、历史、渲染、导出
└─ vue3/                     # Vue 3 响应式桥接层

scripts/
└─ build-output/             # 构建产物镜像与校验脚本

tests/
├─ contract/                 # 产物合同测试
├─ integration/              # 构建集成测试
└─ unit/                     # 构建规则单元测试
```

关键入口：

- `editor/core/src/editor.ts`：`ImageCanvasEditor` 主入口
- `editor/core/src/renderer.ts`：Canvas 预览渲染
- `editor/core/src/image-processing.ts`：导出与图像处理
- `editor/core/src/history.ts`：撤销 / 重做快照逻辑
- `editor/core/src/text-overlay.ts`：文字覆盖层定位与约束
- `editor/vue3/src/useImageEditor.ts`：Vue 组合式 API 桥接
- `apps/web-vue/src/App.vue`：工作台布局与交互编排

## 数据与交互模型

编辑器围绕一个 `EditorState` 运转，核心状态包括：

- `image`：当前图片资源
- `cropRect` / `draftCropRect`：已应用裁剪与裁剪中草稿
- `textOverlay`：文字内容、位置比例、字号与颜色
- `adjustments`：对比度、曝光、高光
- `transform`：旋转与翻转
- `viewport`：预览缩放与偏移
- `activePreset`：当前滤镜预设

这里最重要的“好品味”点有两个：

- 裁剪坐标始终基于原图，而不是基于屏幕坐标乱改，这样旋转、翻转之后状态不会漂。
- 预览缩放和平移只影响工作台视图，不直接写坏原图数据。

## 快速开始

### 环境要求

- `Node.js >= 20.18.3 < 21`
- `pnpm 9.15.0`

### 安装依赖

```bash
pnpm install
```

### 启动开发

```bash
pnpm dev
```

默认会启动 `@image-canvas-editor/web-vue`。

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 Web 开发环境 |
| `pnpm build` | 按工作区顺序构建，并校验产物布局 |
| `pnpm preview` | 预览 Web 构建结果 |
| `pnpm typecheck` | 执行 Web 应用类型检查 |
| `pnpm test:unit-build` | 构建规则相关单元测试 |
| `pnpm test:integration-build` | 构建规则相关集成测试 |
| `pnpm test:contract-build` | 构建产物合同测试 |

## 构建规则

这个仓库对产物布局是有硬约束的，不是随便往 `dist/` 里倒垃圾。

### 工作区构建顺序

根命令 `pnpm build` 会执行：

1. `editor-core` 的 `build:artifact`
2. `editor-vue` 的 `build:artifact`
3. `web-vue` 的 `build:artifact`
4. 将 `apps/web-vue/dist/` 镜像到根 `dist/`
5. 校验所有产物目录与文件集合

### 产物目录职责

| 目录 | 职责 |
| --- | --- |
| `editor/core/dist/` | `@image-canvas-editor/editor-core` 的规范产物目录 |
| `editor/vue3/dist/` | `@image-canvas-editor/editor-vue` 的规范产物目录 |
| `apps/web-vue/dist/` | Web 应用的规范产物目录 |
| `dist/` | `apps/web-vue/dist/` 的兼容镜像出口 |

### 兼容性约束

- 根 `dist/` 必须和 `apps/web-vue/dist/` 文件树一致。
- 根 `dist/` 不允许混入 `editor/core` 或 `editor/vue3` 的库包产物。
- 单包构建只负责自己的规范产物目录。

如果你要改构建脚本，先理解这些规则再动手，否则就是在制造回归。

## 包级说明

### `@image-canvas-editor/editor-core`

面向编辑器内核的无 UI 包，公开的核心入口包括：

```ts
import { ImageCanvasEditor, createInitialEditorState, PRESET_OPTIONS } from '@image-canvas-editor/editor-core';
```

适合放这里的东西：

- 状态模型
- Canvas 渲染
- 历史记录
- 草稿持久化
- 导出逻辑

不适合放这里的东西：

- `window.alert`
- 文件上传按钮
- Vue 响应式对象

### `@image-canvas-editor/editor-vue`

Vue 3 桥接层，当前主要暴露：

```ts
import { useImageEditor } from '@image-canvas-editor/editor-vue';
```

它负责把内核 class 包成适合 Vue 页面消费的组合式接口，包括：

- `canvasRef`
- `state`
- `hasImage`、`canUndo`、`canRedo`
- 上传、裁剪、旋转、滤镜、文字、导出、草稿恢复等动作方法

### `@image-canvas-editor/web-vue`

真正的浏览器应用壳。它负责：

- 页面结构
- Inspector 组织
- 主题切换
- 按钮语义与可访问性
- 浏览器交互提示

## 测试与验证

当前仓库已经把“构建是否正确”当成一等公民，而不是靠肉眼检查：

- `tests/unit/`：校验构建规则模型与 GitHub Pages base 逻辑
- `tests/integration/`：校验完整构建布局、缺失产物失败、单包重建隔离
- `tests/contract/`：校验构建产物合同
- `editor/core/src/*.test.ts`：适合新增无 UI 的编辑器单元测试

推荐的本地验证顺序：

```bash
pnpm typecheck
pnpm build
pnpm test:unit-build
pnpm test:integration-build
pnpm test:contract-build
```

## 开发约束

这些不是建议，是这个仓库能长期维护下去的前提：

- 浏览器 UI、文件输入、提示框只放在 `apps/web-vue`
- `editor/vue3` 只做响应式桥接，不变成第二个业务层
- `editor/core` 负责状态、渲染、导出与草稿，不依赖具体 UI 框架
- 不直接编辑根 `dist/`
- 没有真实痛点，不要引入新的状态库或额外抽象层
- 新测试优先放在 `editor/core/src/*.test.ts`，尽量保持无 UI

## 提交与评审

- Commit 规范：`type(scope): summary`
- 推荐 scope：`editor-core`、`editor-vue`、`web-vue`
- PR 需要说明：动机、影响范围、验证方式
- UI 改动应附截图或录屏
- 涉及状态、草稿、导出的改动，必须说明兼容性影响与回滚策略

## 后续演进

值得做，但必须按价值排序：

- 为 `editor/core` 补更多无 UI 测试
- 继续增强撤销 / 重做覆盖面
- 评估将重图像处理迁移到 `OffscreenCanvas + Worker`
- 在不破坏现有边界的前提下扩展更多编辑能力

不值得现在做的事情也很明确：

- 为“未来可能发布 npm”提前堆复杂发布系统
- 把 UI 逻辑重新塞回内核
- 引入额外状态管理层制造重复状态
