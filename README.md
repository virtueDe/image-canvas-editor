# image-canvas-editor

一个基于 **pnpm workspace + Vue 3 + TypeScript + UnoCSS + Canvas 2D** 的在线图片编辑器 monorepo。

## 为什么这样拆

- **真问题**：原来的 `useImageEditor.ts` 同时负责状态机、Canvas 事件、文件读取、草稿存储、Vue 响应式桥接，边界混乱。
- **更简单的方法**：拆成 `editor-core` 和 `editor-vue` 两层，别为了 monorepo 再引入新状态库。
- **兼容性原则**：保留现有功能、保留浏览器本地草稿、保留根目录 `dist/` 作为构建产物目录。

## 当前能力

- 上传本地图片
- 旋转（90° 快捷旋转 + 任意角度）
- 水平 / 垂直翻转
- 裁剪（画布内交互式框选）
- 滤镜预设（原图 / 黑白 / 暖色 / 冷调 / 复古 / 淡褪）
- 基础调节：对比度 / 曝光 / 高光
- 本地保存编辑草稿
- 导出下载 PNG

## Monorepo 结构

```text
apps/
└─ web-vue/                  # Vue 3 Web 应用壳

editor/
├─ core/                     # Canvas + TypeScript 编辑器内核
└─ vue3/                     # Vue 3 适配层
```

其中：

- `editor/core/src/editor.ts`：`ImageCanvasEditor` class 入口
- `editor/core/src/renderer.ts`：Canvas 预览渲染
- `editor/core/src/image-processing.ts`：导出与图像处理
- `editor/vue3/src/useImageEditor.ts`：Vue 响应式桥接
- `apps/web-vue/src/App.vue`：页面壳与控件布局

## 核心设计

### 1. `editor-core` 只关心编辑器

- 入口是 `ImageCanvasEditor` class
- 持有状态、Canvas 渲染器、裁剪交互、草稿读写
- UI 不直接碰底层事件细节

### 2. `editor-vue` 只做桥接

- 把 class 状态桥接成 Vue `ref/computed`
- 把上传、下载、提示框留在 Vue 层

### 3. `web-vue` 只是应用壳

- 页面布局
- 控件组织
- 样式与展示逻辑

## 开发

```bash
pnpm install
pnpm dev
```

## 构建

```bash
pnpm build
```

根命令会按 `editor-core → editor-vue → web-vue → 根 dist 镜像 → 产物校验` 的顺序完成全量构建。

### 单包构建

```bash
pnpm --filter @image-canvas-editor/editor-core build
pnpm --filter @image-canvas-editor/editor-vue build
pnpm --filter @image-canvas-editor/web-vue build
```

单包构建只负责自己的规范产物目录；其中 `web-vue` 会额外刷新根 `dist/` 兼容出口。

### 构建产物目录职责

- `editor/core/dist/`
  - `@image-canvas-editor/editor-core` 的规范产物目录
  - 至少包含 `index.js`、`index.cjs`、`index.umd.js` 与 `index.d.ts`
- `editor/vue3/dist/`
  - `@image-canvas-editor/editor-vue` 的规范产物目录
  - 至少包含 `index.js`、`index.cjs`、`index.umd.js` 与 `index.d.ts`
- `apps/web-vue/dist/`
  - `@image-canvas-editor/web-vue` 的规范产物目录
  - 至少包含 `index.html` 与 `assets/`
- `dist/`
  - `apps/web-vue/dist/` 的**兼容镜像出口**
  - 只服务旧流程和兼容消费
  - **不要**把两个库包的规范产物复制进来

### 根 `dist/` 与 `apps/web-vue/dist/` 的关系

- `apps/web-vue/dist/` 是 web 应用的**规范产物目录**
- 根 `dist/` 是它的**兼容镜像**
- 两者文件树应保持一致
- 根 `dist/` 不是共享垃圾桶，不承载 `editor/core` 和 `editor/vue3` 的库产物

## 设计原则

1. **原图永远不直接修改**
2. **预览与导出共用同一条渲染管线**
3. **裁剪坐标始终基于原图**
4. **UI 只协调，不拥有编辑器内核**
5. **统一 class 入口，便于未来接 React / Worker / Electron**

## 后续建议

- 增加撤销 / 重做栈
- 将图像处理迁移到 `OffscreenCanvas + Worker`
- 为 `editor-core` 增加无 UI 的测试
- 如果以后真要发布 npm 包，再补包构建流程，不要现在过度设计
