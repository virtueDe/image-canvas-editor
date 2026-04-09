# 顶部状态栏 FPS 显示设计

## 摘要

在现有工作台顶部状态栏增加一个只读 `FPS` 指标，用于观察拖拽、缩放等交互时的渲染帧率。该能力仅用于调试展示，不进入编辑器状态、不参与撤销重做、不写入草稿、不影响导出结果。

## 方案

### 架构

- `editor/core/src/renderer.ts`
  - 在 `CanvasRenderer` 内维护最近 1 秒的渲染时间戳窗口
  - 提供 `getFramesPerSecond()` 只读接口
- `editor/core/src/editor.ts`
  - 透出 `getRenderFps()`，作为 UI 层访问 renderer 统计值的稳定入口
- `editor/vue3/src/useImageEditor.ts`
  - 提供 `fpsText` 计算属性
- `apps/web-vue/src/App.vue`
  - 在顶部状态栏追加 `FPS` 指标

### 显示规则

- 未加载图片时显示 `--`
- 有图片但样本不足时显示当前可估算值
- 状态栏文案格式为 `xx FPS`

## 兼容性

- 不修改 `EditorState`
- 不写入历史快照
- 不写入本地草稿
- 不参与图片导出

## 验证

- 为 renderer 的 FPS 统计新增单测
- 执行 `pnpm typecheck`
