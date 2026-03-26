# 编辑器撤销与重做设计

## 摘要

在现有图片编辑器中增加撤销与重做能力，采用“结果快照 + undo/redo 双栈”的最小方案。历史只记录已提交的编辑结果，不记录裁剪拖拽中的中间态、视图缩放平移等临时交互状态。实现落点在 `editor-core`，`editor-vue` 只做能力桥接，`web-vue` 只增加最小按钮交互。

## 背景

当前编辑器支持旋转、翻转、裁剪、滤镜、参数调节、草稿保存与恢复、PNG 导出，但误操作后只能“重置全部”。这会把局部修正退化成整单回滚，成本太高。

按 Linus 三问判断：

1. 这是真问题，不是想象出来的需求。
2. 最简单的办法是在核心层记录可重建的编辑结果快照，而不是在 UI 层堆操作补丁。
3. 不能破坏现有草稿、裁剪、导出行为，也不能把历史栈做成新的兼容性负担。

## 目标

1. 支持当前编辑会话内的撤销与重做。
2. 历史记录覆盖已提交的编辑结果：
   - 旋转
   - 翻转
   - 应用裁剪
   - 清除裁剪
   - 滤镜切换
   - 参数调节
   - 重置全部
   - 恢复草稿
3. 滑杆连续拖动只产生一条历史记录。
4. 新图片加载后清空历史，避免跨图片污染。
5. UI 只增加最小可用按钮，不引入复杂历史面板。

## 非目标

1. 不做跨刷新持久化的撤销与重做。
2. 不记录裁剪框拖拽过程中的每一帧状态。
3. 不记录视图缩放、平移、双击复位视图等浏览行为。
4. 不实现历史列表、历史命名、时间线面板。
5. 不引入新的状态管理库。

## 设计原则

1. 历史属于核心控制逻辑，不属于 UI。
2. 历史只保存“编辑结果”，不保存“运行时交互过程”。
3. 单次用户意图应对应单条历史记录，避免把连续输入拆成碎片。
4. 新方案必须与现有草稿序列化结构兼容，不修改草稿格式的语义边界。

## 数据模型

### 历史快照

历史栈保存可重建的编辑结果快照，而不是完整运行时状态。

```ts
type HistorySnapshot = {
  imageDataUrl: string | null;
  cropRect: Rect | null;
  adjustments: {
    contrast: number;
    exposure: number;
    highlights: number;
  };
  transform: {
    rotation: number;
    flipX: boolean;
    flipY: boolean;
  };
  activePreset: FilterPreset;
};
```

### 不进入历史的数据

以下状态不进入 `HistorySnapshot`：

1. `cropMode`
2. `draftCropRect`
3. `viewport.zoom`
4. `viewport.offsetX`
5. `viewport.offsetY`
6. `HTMLImageElement`
7. Pointer 拖拽中的临时交互状态

理由很直接：这些数据要么是临时交互态，要么是运行时对象，不属于用户希望撤销的编辑结果。

### 栈模型

在 `ImageCanvasEditor` 内部维护：

```ts
type HistoryStacks = {
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
};
```

建议增加固定上限，默认 `50` 条。超过上限时丢弃最老的 `undo` 记录，避免历史无限增长。

## 状态流转

### 提交型编辑

提交型编辑发生前，先记录当前快照到 `undoStack`，再执行编辑，并清空 `redoStack`。

适用操作：

1. `rotateBy`
2. `toggleFlip`
3. `applyCrop`
4. `resetCrop`
5. `applyPreset`
6. 参数提交
7. 旋转滑杆提交
8. `resetEdits`
9. `restoreDraft`

### 非提交型编辑

以下操作不进入历史：

1. `enterCropMode`
2. `cancelCrop`
3. 裁剪框拖拽过程
4. `zoomIn`
5. `zoomOut`
6. `resetViewport`
7. 预览平移
8. `saveDraft`
9. `download`

### 撤销

执行 `undo()` 时：

1. 若 `undoStack` 为空，直接 no-op。
2. 将当前快照压入 `redoStack`。
3. 弹出 `undoStack` 顶部快照并应用。
4. 退出裁剪模式，清空 `draftCropRect`，视图保持不变。

### 重做

执行 `redo()` 时：

1. 若 `redoStack` 为空，直接 no-op。
2. 将当前快照压入 `undoStack`。
3. 弹出 `redoStack` 顶部快照并应用。
4. 退出裁剪模式，清空 `draftCropRect`，视图保持不变。

### 新图片加载

执行 `loadFile()` 时：

1. 应用新图片初始状态。
2. 清空 `undoStack`。
3. 清空 `redoStack`。

这样可以避免不同图片之间互相污染历史。

## 核心 API

在 `ImageCanvasEditor` 中增加：

```ts
undo(): void;
redo(): void;
canUndo(): boolean;
canRedo(): boolean;
```

内部辅助能力建议包含：

```ts
private captureHistorySnapshot(state: EditorState): HistorySnapshot;
private applyHistorySnapshot(snapshot: HistorySnapshot): void;
private pushUndoSnapshot(): void;
private clearRedoStack(): void;
private commitChange(updater: Partial<EditorState> | ((state: EditorState) => EditorState)): void;
```

其中：

1. `captureHistorySnapshot` 负责提取可重建编辑结果。
2. `applyHistorySnapshot` 负责把快照映射回当前状态。
3. `commitChange` 负责统一“压入 undo、执行变更、清空 redo、render”的提交流程，减少分支复制。

## 连续输入合并策略

`updateRotation` 和 `updateAdjustment` 当前用于滑杆实时预览。如果每次 `input` 都压栈，历史会爆炸。

因此需要把连续输入拆成两个阶段：

1. 预览阶段
   - `input` 事件只更新当前状态，不压历史。
2. 提交阶段
   - `change` 事件或拖拽结束时，将本次连续修改整体视为一次提交，写入一条历史记录。

这要求核心层提供“预览更新”和“提交更新”的区分，或者由桥接层在开始拖动时记录初始值、结束时调用提交接口。无论选哪种细节实现，对外语义都必须保证“一次拖动 = 一条历史”。

## 分层职责

### editor-core

负责：

1. 历史快照数据结构
2. undo/redo 双栈
3. 提交型与非提交型变更的区分
4. 撤销重做的最终状态应用
5. 单元测试

### editor-vue

负责：

1. 暴露 `undo`、`redo`
2. 暴露 `canUndo`、`canRedo`
3. 处理滑杆预览与提交时机

### web-vue

负责：

1. 增加 `撤销`、`重做` 按钮
2. 绑定禁用态
3. 保持现有布局风格，不扩散成复杂历史面板

## UI 方案

在编辑工作台顶部控制区增加两个按钮：

1. `撤销`
2. `重做`

交互规则：

1. 无图片时禁用。
2. `canUndo()` 为 `false` 时禁用撤销。
3. `canRedo()` 为 `false` 时禁用重做。
4. 不新增历史列表和额外文案说明，先保持最小界面。

## 测试策略

测试重点放在 `editor/core/src/*.test.ts`，优先覆盖核心逻辑。

### 核心行为

1. 连续执行两个提交型编辑后，`undo` 按顺序逐步回退。
2. `undo` 后执行新的提交型编辑，`redo` 被清空。
3. `redo` 后状态恢复到撤销前。
4. `loadFile` 后历史栈被清空。

### 边界行为

1. `enterCropMode` 不进入历史。
2. `cancelCrop` 不进入历史。
3. 缩放、平移、复位视图不进入历史。
4. `restoreDraft` 作为一次可撤销提交。

### 连续输入

1. 一次参数滑杆拖动只生成一条历史。
2. 一次任意角度滑杆拖动只生成一条历史。

## 兼容性与风险

### 兼容性

1. 不修改导出渲染管线。
2. 不修改草稿持久化数据的结构边界。
3. 不改变现有编辑结果的计算方式，只增加历史回退能力。

### 主要风险

1. 滑杆连续输入如果没有做合并提交，历史会爆炸。
2. 若把 `cropMode` 或 `viewport` 混进历史，会让撤销体验变差。
3. 若 `restoreDraft` 不走提交流程，用户会失去撤回恢复草稿的能力。

## 回滚策略

本功能应拆成小 patch：

1. `editor-core` 增加历史与测试
2. `editor-vue` 桥接暴露
3. `web-vue` 按钮接入

如果后续发现历史行为不稳定，可以按层回滚：

1. 先回滚 UI 按钮暴露
2. 再回滚桥接层接口
3. 最后回滚核心历史实现

因为历史能力不改变图片数据格式，也不改变导出协议，所以回滚风险可控。

## 推荐结论

采用“结果快照 + 双栈 + 连续输入合并提交”的方案，在 `editor-core` 实现历史控制逻辑，在 `editor-vue` 提供桥接，在 `web-vue` 只增加最小按钮交互。这是当前仓库里最简单、最稳、最容易测试的实现路径。
