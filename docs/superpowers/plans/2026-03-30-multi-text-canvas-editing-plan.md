# 多文字 Canvas 原位编辑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前单文字覆盖层改造成多文字 Canvas 原位编辑系统，支持插入态点击落点创建文字、点击已有文字直接编辑、编辑框拖拽图标、多行显式换行，以及右侧属性面板跟随当前选中对象。

**Architecture:** 在 `editor/core` 中引入 `texts[] + activeTextId + textToolState` 作为文本系统真相，并将单行 `text-overlay` 逻辑升级为支持多行布局、命中检测和编辑态绘制的统一文本模块。`editor/vue3` 负责隐藏 `textarea` 的事件桥接，`apps/web-vue` 负责工具栏、焦点管理、右侧面板和画布壳层 UI，不保存第二份文本草稿。

**Tech Stack:** TypeScript、Vue 3、Vitest、Canvas 2D、pnpm workspace

---

## File Map

### Core model and text engine

- Modify: `editor/core/src/types.ts`
  - 将 `textOverlay` 替换为 `texts`、`activeTextId`、`textToolState`
- Modify: `editor/core/src/history.ts`
  - 让历史快照覆盖多文字对象和当前激活项
- Modify: `editor/core/src/persistence.ts`
  - 存储和恢复新草稿结构，直接切到新 schema/key
- Create: `editor/core/src/editor-text-state.test.ts`
  - 文本状态模型、草稿结构与基础快照断言
- Create: `editor/core/src/text-engine.ts`
  - 多行文本布局、命中检测、编辑框/拖拽图标位置、导出绘制配置
- Create: `editor/core/src/text-engine.test.ts`
  - 多行布局、命中检测、拖拽图标区域等单元测试
- Create: `editor/core/src/editor-workflow.test.ts`
  - 插入、编辑、拖拽、编辑会话历史断言
- Modify: `editor/core/src/editor.ts`
  - 重写文本状态机、插入/编辑/拖拽命令、历史边界
- Modify: `editor/core/src/renderer.ts`
  - 绘制多文字、编辑框、自绘 caret、拖拽 icon
- Modify: `editor/core/src/image-processing.ts`
  - 导出多行文字
- Modify: `editor/core/src/index.ts`
  - 暴露新类型和新常量

### Vue bridge

- Modify: `editor/vue3/src/useImageEditor.ts`
  - 暴露 `activeText`、插入态/编辑态、隐藏 textarea 绑定值与事件桥接 API
- Modify: `editor/vue3/src/index.ts`
  - 透出更新后的 bridge 类型

### Web shell

- Modify: `apps/web-vue/src/App.vue`
  - 工具栏“添加文字”进入插入态、挂隐藏 `textarea`、右侧文字属性区域跟随 `activeText`
- Modify: `apps/web-vue/src/styles.css`
  - 隐藏 `textarea`、插入态/编辑态指针、画布编辑辅助样式
- Modify: `apps/web-vue/src/components/WorkbenchIcon.vue`
  - 新增拖拽图标与必要的文字工具图标

### Existing tests to update

- Modify: `editor/core/src/history.test.ts`
  - 从单 `textOverlay` 改为多文字历史断言
- Replace or delete: `editor/core/src/text-overlay.test.ts`
  - 迁移到 `text-engine.test.ts`

## Task 1: 重建文本模型与草稿结构

**Files:**
- Create: `editor/core/src/editor-text-state.test.ts`
- Modify: `editor/core/src/types.ts`
- Modify: `editor/core/src/history.ts`
- Modify: `editor/core/src/persistence.ts`
- Modify: `editor/core/src/history.test.ts`

- [ ] **Step 1: 写失败测试，锁定多文字状态和草稿结构**

```ts
import { describe, expect, it } from 'vitest';
import { captureHistorySnapshot } from './history';
import type { EditorState } from './types';

const baseState = (): EditorState => ({
  image: null,
  cropRect: null,
  draftCropRect: null,
  cropMode: false,
  texts: [
    {
      id: 'text-1',
      content: '第一段',
      xRatio: 0.25,
      yRatio: 0.3,
      fontSize: 32,
      color: '#ffffff',
      align: 'center',
      lineHeight: 1.25,
    },
  ],
  activeTextId: 'text-1',
  textToolState: { mode: 'editing', textId: 'text-1', caretIndex: 3, selectionStart: 3, selectionEnd: 3, composing: false },
  adjustments: { contrast: 0, exposure: 0, highlights: 0 },
  transform: { rotation: 0, flipX: false, flipY: false },
  viewport: { zoom: 1, offsetX: 0, offsetY: 0 },
  activePreset: 'original',
});

describe('history snapshot with multi-text state', () => {
  it('captures texts and activeTextId instead of single textOverlay', () => {
    const snapshot = captureHistorySnapshot(baseState());
    expect(snapshot.texts).toHaveLength(1);
    expect(snapshot.activeTextId).toBe('text-1');
    expect('textOverlay' in snapshot).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试，确认旧结构下失败**

Run: `npx vitest run editor/core/src/history.test.ts editor/core/src/editor-text-state.test.ts`

Expected: FAIL，报 `texts` / `activeTextId` 字段不存在，或现有快照仍依赖 `textOverlay`

- [ ] **Step 3: 最小实现新的类型、历史快照与草稿序列化**

```ts
// editor/core/src/types.ts
export interface TextItem {
  id: string;
  content: string;
  xRatio: number;
  yRatio: number;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
}

export type TextToolState =
  | { mode: 'idle'; hoverTextId: string | null }
  | { mode: 'inserting' }
  | { mode: 'editing'; textId: string; caretIndex: number; selectionStart: number; selectionEnd: number; composing: boolean }
  | { mode: 'dragging'; textId: string; startClientX: number; startClientY: number; originXRatio: number; originYRatio: number };

export interface EditorState {
  image: ImageResource | null;
  cropRect: Rect | null;
  draftCropRect: Rect | null;
  cropMode: boolean;
  texts: TextItem[];
  activeTextId: string | null;
  textToolState: TextToolState;
  adjustments: EditorAdjustments;
  transform: EditorTransform;
  viewport: EditorViewport;
  activePreset: FilterPreset;
}
```

```ts
// editor/core/src/history.ts
export interface HistorySnapshot {
  cropRect: Rect | null;
  texts: TextItem[];
  activeTextId: string | null;
  adjustments: EditorAdjustments;
  transform: EditorTransform;
  activePreset: FilterPreset;
}
```

```ts
// editor/core/src/persistence.ts
const DRAFT_STORAGE_KEY = 'image-canvas-editor:draft:v2';
const DRAFT_SCHEMA_VERSION = 2;
```

- [ ] **Step 4: 重新运行目标测试，确认新模型落稳**

Run: `npx vitest run editor/core/src/history.test.ts editor/core/src/editor-text-state.test.ts`

Expected: PASS，至少通过新的快照断言与草稿 schema 断言

- [ ] **Step 5: 提交**

```bash
git add editor/core/src/types.ts editor/core/src/history.ts editor/core/src/persistence.ts editor/core/src/history.test.ts editor/core/src/editor-text-state.test.ts
git commit -m "feat(editor-core): add multi-text state model"
```

## Task 2: 建立统一文本布局引擎

**Files:**
- Create: `editor/core/src/text-engine.ts`
- Create: `editor/core/src/text-engine.test.ts`
- Modify: `editor/core/src/index.ts`

- [ ] **Step 1: 写失败测试，定义多行布局、命中和拖拽图标位置**

```ts
import { describe, expect, it } from 'vitest';
import { resolveTextLayout, resolveTextScreenRect, resolveDragHandleRect, isPointInTextBlock } from './text-engine';
import type { TextItem } from './types';

const item: TextItem = {
  id: 'text-1',
  content: '第一行\n第二行',
  xRatio: 0.5,
  yRatio: 0.5,
  fontSize: 40,
  color: '#fff',
  align: 'center',
  lineHeight: 1.25,
};

describe('text engine layout', () => {
  it('measures multiline content and exposes line boxes', () => {
    const layout = resolveTextLayout(item, 1200, 800, () => ({ width: 80, actualBoundingBoxAscent: 30, actualBoundingBoxDescent: 10 }));
    expect(layout.lines).toHaveLength(2);
    expect(layout.height).toBeGreaterThan(70);
  });

  it('exposes a drag handle rect outside the text body', () => {
    const rect = resolveTextScreenRect(item, 1200, 800, { x: 0, y: 0, width: 1200, height: 800 }, () => ({ width: 80, actualBoundingBoxAscent: 30, actualBoundingBoxDescent: 10 }));
    const handle = resolveDragHandleRect(rect!);
    expect(handle.x).toBeGreaterThan(rect!.x + rect!.width - 1);
  });

  it('treats the body rect as editable hit area', () => {
    const rect = resolveTextScreenRect(item, 1200, 800, { x: 0, y: 0, width: 1200, height: 800 }, () => ({ width: 80, actualBoundingBoxAscent: 30, actualBoundingBoxDescent: 10 }));
    expect(isPointInTextBlock(rect!, rect!.x + 10, rect!.y + 10)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试，确认当前单行 `text-overlay.ts` 不足以通过**

Run: `npx vitest run editor/core/src/text-engine.test.ts`

Expected: FAIL，报缺少 `resolveTextLayout` 或布局结果不支持多行

- [ ] **Step 3: 实现统一文本布局模块**

```ts
// editor/core/src/text-engine.ts
export interface TextLayoutLine {
  text: string;
  width: number;
  baselineY: number;
}

export interface TextLayout {
  lines: TextLayoutLine[];
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  bodyRect: Rect;
}

export const splitTextLines = (content: string): string[] => content.split('\n');

export const resolveTextLayout = (item: TextItem, canvasWidth: number, canvasHeight: number, measureText = defaultMeasureText): TextLayout => {
  const lines = splitTextLines(item.content);
  const lineAdvance = item.fontSize * item.lineHeight;
  const measured = lines.map((line) => ({ text: line || ' ', metrics: measureText(line || ' ', item.fontSize) }));
  const width = Math.max(...measured.map((line) => line.metrics.width), item.fontSize * 0.5);
  const height = Math.max(item.fontSize, lineAdvance * lines.length);
  const anchorX = item.xRatio * canvasWidth;
  const anchorY = item.yRatio * canvasHeight;
  return {
    lines: measured.map((line, index) => ({
      text: line.text,
      width: line.metrics.width,
      baselineY: anchorY - height / 2 + item.fontSize + index * lineAdvance,
    })),
    width,
    height,
    anchorX,
    anchorY,
    bodyRect: { x: anchorX - width / 2, y: anchorY - height / 2, width, height },
  };
};
```

- [ ] **Step 4: 运行测试，确认预览与导出共用的布局基础成立**

Run: `npx vitest run editor/core/src/text-engine.test.ts`

Expected: PASS，覆盖多行高度、正文命中和拖拽图标区域

- [ ] **Step 5: 提交**

```bash
git add editor/core/src/text-engine.ts editor/core/src/text-engine.test.ts editor/core/src/index.ts
git commit -m "feat(editor-core): add multiline text layout engine"
```

## Task 3: 重写 core 文本状态机与历史边界

**Files:**
- Modify: `editor/core/src/editor.ts`
- Modify: `editor/core/src/history.ts`
- Modify: `editor/core/src/history.test.ts`
- Create: `editor/core/src/editor-workflow.test.ts`

- [ ] **Step 1: 写失败测试，定义插入、点击编辑、拖拽与编辑会话历史**

```ts
import { describe, expect, it } from 'vitest';
import { ImageCanvasEditor } from './editor';

describe('multi-text editor workflow', () => {
  it('creates a text item after insertion placement', () => {
    const editor = new ImageCanvasEditor();
    editor.startTextInsertion();
    editor.placeTextAt(0.4, 0.5);
    expect(editor.getState().texts).toHaveLength(1);
    expect(editor.getState().textToolState.mode).toBe('editing');
  });

  it('keeps one undo entry for a single editing session', () => {
    const editor = new ImageCanvasEditor();
    editor.startTextInsertion();
    editor.placeTextAt(0.4, 0.5);
    editor.insertText('标题');
    editor.insertLineBreak();
    editor.insertText('副标题');
    editor.finishTextEditing();
    editor.undo();
    expect(editor.getState().texts).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行测试，确认当前 `editor.ts` API 和状态机不满足需求**

Run: `npx vitest run editor/core/src/history.test.ts editor/core/src/editor-workflow.test.ts`

Expected: FAIL，报缺少 `startTextInsertion` / `placeTextAt` / `finishTextEditing` 等 API

- [ ] **Step 3: 最小实现多文字状态机与编辑会话历史**

```ts
// editor/core/src/editor.ts
startTextInsertion(): void {
  if (!this.store.getState().image || this.store.getState().cropMode) {
    return;
  }
  this.setState((currentState) => ({
    ...currentState,
    activeTextId: null,
    textToolState: { mode: 'inserting' },
  }));
}

placeTextAt(xRatio: number, yRatio: number): void {
  const nextText: TextItem = {
    id: `text-${Date.now()}`,
    content: '',
    xRatio,
    yRatio,
    fontSize: 48,
    color: '#F5EFE7',
    align: 'center',
    lineHeight: 1.25,
  };
  this.commitChange((currentState) => ({
    ...currentState,
    texts: [...currentState.texts, nextText],
    activeTextId: nextText.id,
    textToolState: { mode: 'editing', textId: nextText.id, caretIndex: 0, selectionStart: 0, selectionEnd: 0, composing: false },
  }));
}
```

```ts
// editor/core/src/history.ts
export const snapshotsEqual = (left: HistorySnapshot, right: HistorySnapshot): boolean =>
  left.activeTextId === right.activeTextId &&
  JSON.stringify(left.texts) === JSON.stringify(right.texts) &&
  left.activePreset === right.activePreset &&
  left.transform.rotation === right.transform.rotation &&
  left.transform.flipX === right.transform.flipX &&
  left.transform.flipY === right.transform.flipY &&
  left.adjustments.contrast === right.adjustments.contrast &&
  left.adjustments.exposure === right.adjustments.exposure &&
  left.adjustments.highlights === right.adjustments.highlights;
```

- [ ] **Step 4: 运行目标测试，确认插入/编辑/拖拽边界与 undo 模型成立**

Run: `npx vitest run editor/core/src/history.test.ts editor/core/src/text-engine.test.ts`

Expected: PASS，插入后进入编辑态、一次编辑会话只生成一条 undo 记录

- [ ] **Step 5: 提交**

```bash
git add editor/core/src/editor.ts editor/core/src/history.ts editor/core/src/history.test.ts editor/core/src/editor-workflow.test.ts
git commit -m "feat(editor-core): add multi-text editing state machine"
```

## Task 4: 接入渲染与导出

**Files:**
- Modify: `editor/core/src/renderer.ts`
- Modify: `editor/core/src/image-processing.ts`
- Modify: `editor/core/src/text-engine.test.ts`

- [ ] **Step 1: 写失败测试，锁定多行导出和编辑态装饰不进导出**

```ts
import { describe, expect, it } from 'vitest';
import { createProcessedCanvas } from './image-processing';
import type { EditorState } from './types';

const makeStateWithImageAndTexts = (texts: EditorState['texts']): EditorState => ({
  image: {
    element: {} as HTMLImageElement,
    width: 1200,
    height: 800,
    name: 'sample.png',
    dataUrl: 'data:image/png;base64,stub',
  },
  cropRect: null,
  draftCropRect: null,
  cropMode: false,
  texts,
  activeTextId: texts[0]?.id ?? null,
  textToolState: { mode: 'idle', hoverTextId: null },
  adjustments: { contrast: 0, exposure: 0, highlights: 0 },
  transform: { rotation: 0, flipX: false, flipY: false },
  viewport: { zoom: 1, offsetX: 0, offsetY: 0 },
  activePreset: 'original',
});

describe('text export rendering', () => {
  it('draws multiline text content from texts[]', () => {
    const state = makeStateWithImageAndTexts([
      { id: 't1', content: '第一行\n第二行', xRatio: 0.5, yRatio: 0.5, fontSize: 32, color: '#fff', align: 'center', lineHeight: 1.25 },
    ]);
    const result = createProcessedCanvas(state);
    expect(result).not.toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试，确认旧导出仍绑定 `textOverlay`**

Run: `npx vitest run editor/core/src/text-engine.test.ts`

Expected: FAIL，当前 `image-processing.ts` 仍读取单个 `textOverlay`

- [ ] **Step 3: 实现多文字渲染与导出**

```ts
// editor/core/src/image-processing.ts
for (const textItem of state.texts) {
  const layout = resolveTextLayout(textItem, canvas.width, canvas.height, (text, fontSize) => {
    ctx.font = `${fontSize}px ${FONT_FAMILY}`;
    return ctx.measureText(text);
  });

  ctx.fillStyle = textItem.color;
  for (const line of layout.lines) {
    ctx.fillText(line.text, layout.anchorX, line.baselineY);
  }
}
```

```ts
// editor/core/src/renderer.ts
if (state.texts.length > 0) {
  for (const textItem of state.texts) {
    this.drawTextBlock(ctx, textItem, previewMetrics, state.activeTextId === textItem.id, state.textToolState);
  }
}
```

- [ ] **Step 4: 运行目标测试与构建，确认预览导出一起工作**

Run: `npx vitest run editor/core/src/text-engine.test.ts`

Run: `pnpm build`

Expected: PASS，且构建不再引用旧 `textOverlay`

- [ ] **Step 5: 提交**

```bash
git add editor/core/src/renderer.ts editor/core/src/image-processing.ts editor/core/src/text-engine.test.ts
git commit -m "feat(editor-core): render and export multiline texts"
```

## Task 5: 建立 Vue bridge 与隐藏 textarea 输入代理

**Files:**
- Modify: `editor/vue3/src/useImageEditor.ts`
- Modify: `editor/vue3/src/index.ts`

- [ ] **Step 1: 在 `useImageEditor.ts` 中先写会报错的返回值，锁定 activeText 与隐藏 textarea API**

```ts
return {
  PRESET_OPTIONS,
  TEXT_PRESET_COLORS,
  canvasRef,
  state: renderState,
  texts,
  activeText,
  isTextInserting,
  isTextEditing,
  hiddenTextareaValue,
  onHiddenTextareaInput,
  onHiddenTextareaKeydown,
  onHiddenTextareaCompositionStart,
  onHiddenTextareaCompositionEnd,
  startTextInsertion,
  focusTextById,
};
```

- [ ] **Step 2: 运行类型检查，确认当前 bridge 不暴露多文字状态**

Run: `pnpm typecheck`

Expected: FAIL，`useImageEditor` 还只暴露 `textOverlay` / `hasTextOverlay`

- [ ] **Step 3: 最小实现 bridge 的新 computed 与 textarea 事件桥接**

```ts
// editor/vue3/src/useImageEditor.ts
const texts = computed(() => renderState.value.texts);
const activeText = computed(() => texts.value.find((item) => item.id === renderState.value.activeTextId) ?? null);
const isTextInserting = computed(() => renderState.value.textToolState.mode === 'inserting');
const isTextEditing = computed(() => renderState.value.textToolState.mode === 'editing');
const hiddenTextareaValue = computed(() => activeText.value?.content ?? '');

const onHiddenTextareaInput = (event: Event): void => {
  getEditor().replaceActiveTextContent((event.target as HTMLTextAreaElement).value);
};

const onHiddenTextareaKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Enter') {
    event.preventDefault();
    getEditor().insertLineBreak();
  }
};
```

- [ ] **Step 4: 重新运行类型检查，确认 UI 层已可消费新 bridge**

Run: `pnpm typecheck`

Expected: PASS，`useImageEditor` 不再引用旧 `textOverlay` API

- [ ] **Step 5: 提交**

```bash
git add editor/vue3/src/useImageEditor.ts editor/vue3/src/index.ts
git commit -m "feat(editor-vue): bridge multi-text canvas editing"
```

## Task 6: 重构 Web 壳层文字工具与右侧面板

**Files:**
- Modify: `apps/web-vue/src/App.vue`
- Modify: `apps/web-vue/src/styles.css`
- Modify: `apps/web-vue/src/components/WorkbenchIcon.vue`

- [ ] **Step 1: 写失败验证清单，锁定 UI 行为**

```md
- 点击“文字”按钮后进入插入态，状态提示切到插入模式
- 在画布点击后出现编辑框和拖拽图标
- 点击已有文字后右侧面板显示当前文字内容/字号/颜色
- 点击空白处结束编辑
- 拖拽图标移动文字后仍保持当前对象选中
```

- [ ] **Step 2: 运行类型检查，确认 `App.vue` 仍依赖旧单文字 API**

Run: `pnpm typecheck`

Expected: FAIL，`textOverlay`、`hasTextOverlay`、`ensureTextOverlay` 等旧字段/方法不存在

- [ ] **Step 3: 最小实现 UI 壳层**

```vue
<!-- apps/web-vue/src/App.vue -->
<textarea
  ref="hiddenTextInputRef"
  class="canvas-text-proxy"
  :value="hiddenTextareaValue"
  :disabled="!isTextEditing"
  @input="onHiddenTextareaInput"
  @keydown="onHiddenTextareaKeydown"
  @compositionstart="onHiddenTextareaCompositionStart"
  @compositionend="onHiddenTextareaCompositionEnd"
/>

<button class="dock-tool-btn" type="button" :disabled="!canEditText" @click="startTextInsertion">
  <WorkbenchIcon name="text" :size="18" />
</button>
```

```css
/* apps/web-vue/src/styles.css */
.canvas-text-proxy {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.editor-stage.is-text-inserting canvas {
  cursor: crosshair;
}

.editor-stage.is-text-editing canvas {
  cursor: text;
}
```

- [ ] **Step 4: 运行类型检查和构建，确认 UI 壳层接入完成**

Run: `pnpm typecheck`

Run: `pnpm build`

Expected: PASS，`App.vue` 和 `styles.css` 已完全切换到新文字系统

- [ ] **Step 5: 提交**

```bash
git add apps/web-vue/src/App.vue apps/web-vue/src/styles.css apps/web-vue/src/components/WorkbenchIcon.vue
git commit -m "feat(web-vue): add canvas-native multi-text editing UI"
```

## Task 7: 全量验证与回归检查

**Files:**
- Modify: `editor/core/src/text-engine.test.ts`
- Modify: `editor/core/src/history.test.ts`
- Modify: `docs/superpowers/specs/2026-03-30-multi-text-canvas-editing-design.md` (only if implementation drift needs documenting)

- [ ] **Step 1: 补齐最后缺口测试**

```ts
it('deletes an empty text when editing finishes', () => {
  const editor = new ImageCanvasEditor();
  editor.startTextInsertion();
  editor.placeTextAt(0.5, 0.5);
  editor.finishTextEditing();
  expect(editor.getState().texts).toEqual([]);
});
```

- [ ] **Step 2: 跑核心单测**

Run: `npx vitest run editor/core/src/history.test.ts editor/core/src/text-engine.test.ts`

Expected: PASS

- [ ] **Step 3: 跑工作区类型检查和构建**

Run: `pnpm typecheck`

Run: `pnpm build`

Expected: PASS

- [ ] **Step 4: 做手工验收**

Run:

```bash
pnpm dev
```

Expected:

- 上传图片后，点击“文字”进入插入态
- 画布点击后创建新文字
- 点击已有文字直接出现编辑框
- 按回车插入换行
- 仅拖拽图标可移动文字
- 右侧面板始终跟随当前文字对象
- 导出 PNG 不包含编辑框、拖拽图标、caret

- [ ] **Step 5: 提交**

```bash
git add editor/core/src/text-engine.test.ts editor/core/src/history.test.ts
git commit -m "test: verify multi-text canvas editing flow"
```

## Self-Review

### Spec coverage

- 多文字对象模型：Task 1, Task 3
- 插入态点击落点创建文字：Task 3, Task 6
- 点击已有文字直接编辑：Task 3, Task 6
- 编辑框拖拽图标：Task 2, Task 4, Task 6
- 显式换行：Task 2, Task 3, Task 5
- 右侧属性面板只跟随当前选中项：Task 5, Task 6
- 不做旧草稿兼容：Task 1
- 导出不包含编辑态装饰：Task 4, Task 7

### Placeholder scan

- 没有 `TODO` / `TBD`
- 所有任务都给出文件、命令和最小代码形状
- 没有“参考前文即可”这种跨任务偷懒写法

### Type consistency

- 全文统一使用 `TextItem`、`texts`、`activeTextId`、`textToolState`
- 全文统一使用 `startTextInsertion`、`placeTextAt`、`finishTextEditing`
- bridge 中统一使用 `hiddenTextareaValue`、`onHiddenTextareaInput`、`replaceActiveTextContent`
- 右侧面板与 bridge 统一绑定 `activeText`
