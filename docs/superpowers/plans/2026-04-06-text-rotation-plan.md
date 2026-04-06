# 文字旋转 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为当前文字系统补齐产品级旋转能力，支持右侧属性面板调角度、画布旋转手柄拖拽、预览与导出一致、草稿与撤销重做兼容。

**Architecture:** 在 `editor/core` 中为 `TextItem` 引入独立 `rotation` 字段，并将旋转作为附加几何层处理，保持 `resolveTextLayout` 继续负责未旋转正文布局。命中、手柄、预览渲染、导出渲染统一基于“局部坐标 + 正反变换”实现，`editor/vue3` 只桥接旋转状态与更新方法，`apps/web-vue` 负责属性面板和画布旋转手柄交互。

**Tech Stack:** TypeScript、Vue 3、Vitest、Canvas 2D、pnpm workspace

---

## File Map

### Core state and compatibility

- Modify: `editor/core/src/types.ts`
  - 为 `TextItem` / `TextOverlay` 增加 `rotation`
  - 扩展 `TextToolState` 支持 `rotating`
  - 更新 legacy shim 与文本归一化逻辑
- Modify: `editor/core/src/history.ts`
  - 将 `rotation` 纳入历史快照与比较
- Modify: `editor/core/src/persistence.ts`
  - 草稿持久化和恢复补齐 `rotation` 兼容
- Modify: `editor/core/src/editor-text-state.test.ts`
  - 增加 `rotation` 与 `rotating` 状态兼容测试
- Modify: `editor/core/src/history.test.ts`
  - 增加旋转快照断言

### Rotation geometry and text engine

- Modify: `editor/core/src/text-engine.ts`
  - 新增角度归一化、局部坐标变换、旋转手柄点位、旋转命中、旋转包围框
- Modify: `editor/core/src/text-engine.test.ts`
  - 覆盖旋转几何、命中、手柄、角度计算

### Editor state machine and rendering

- Modify: `editor/core/src/editor.ts`
  - 接入 `rotating-text` 交互态
  - 新增更新当前文字旋转、开始旋转、拖拽旋转、结束旋转
- Modify: `editor/core/src/renderer.ts`
  - 选中框、移动手柄、旋转手柄、编辑 caret 按旋转结果绘制
- Modify: `editor/core/src/image-processing.ts`
  - 导出文字时使用相同旋转语义
- Modify: `editor/core/src/editor-workflow.test.ts`
  - 新建旋转 workflow 与历史边界
- Modify: `editor/core/src/image-processing.test.ts`
  - 导出绘制调用覆盖旋转

### Vue bridge and web shell

- Modify: `editor/vue3/src/useImageEditor.ts`
  - 暴露 `activeTextRotation`、旋转更新接口
- Modify: `editor/vue3/src/index.ts`
  - 更新导出类型
- Modify: `apps/web-vue/src/App.vue`
  - 右侧“文字”面板新增旋转滑杆
- Modify: `apps/web-vue/src/styles.css`
  - 旋转属性区域及画布手柄样式
- Modify: `apps/web-vue/src/components/WorkbenchIcon.vue`
  - 新增旋转图标（如果当前手柄需要图标表达）

## Task 1: 扩展文字模型、历史与草稿兼容

**Files:**
- Modify: `editor/core/src/types.ts`
- Modify: `editor/core/src/history.ts`
- Modify: `editor/core/src/persistence.ts`
- Modify: `editor/core/src/editor-text-state.test.ts`
- Modify: `editor/core/src/history.test.ts`

- [ ] **Step 1: 写失败测试，锁定 `rotation` 与 `rotating` 的状态兼容**

```ts
it('restore 会为缺失 rotation 的 legacy text 补 0 度', async () => {
  storage.set(
    'image-canvas-editor:draft:v2',
    JSON.stringify({
      schemaVersion: 2,
      image: null,
      cropRect: null,
      texts: [{ id: 'text-1', content: '标题', xRatio: 0.2, yRatio: 0.3, fontSize: 32, color: '#fff', align: 'center', lineHeight: 1.25 }],
      activeTextId: 'text-1',
      textToolState: { mode: 'idle', hoverTextId: null },
      adjustments: { contrast: 0, exposure: 0, highlights: 0 },
      transform: { rotation: 0, flipX: false, flipY: false },
      activePreset: 'original',
    }),
  );

  const restored = await createLocalDraftStore().restore();
  expect(restored.texts[0]?.rotation).toBe(0);
});

it('history snapshot includes active text rotation', () => {
  const snapshot = captureHistorySnapshot({
    ...baseState(),
    texts: [{ ...baseState().texts[0]!, rotation: 32 }],
  });

  expect(snapshot.texts[0]?.rotation).toBe(32);
});
```

- [ ] **Step 2: 运行失败测试，确认当前模型缺失 `rotation`**

Run: `pnpm exec vitest run editor/core/src/editor-text-state.test.ts editor/core/src/history.test.ts`

Expected: FAIL，报 `rotation` 字段不存在，或恢复后值为 `undefined`

- [ ] **Step 3: 最小实现 `TextItem` / `TextOverlay` / `TextToolState` 扩展**

```ts
export interface TextItem {
  id: string;
  content: string;
  xRatio: number;
  yRatio: number;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  rotation: number;
}

export type TextToolState =
  | { mode: 'idle'; hoverTextId: string | null }
  | { mode: 'inserting' }
  | { mode: 'editing'; textId: string; caretIndex: number; selectionStart: number; selectionEnd: number; composing: boolean }
  | { mode: 'dragging'; textId: string; startClientX: number; startClientY: number; originXRatio: number; originYRatio: number }
  | { mode: 'rotating'; textId: string; startClientX: number; startClientY: number; originRotation: number; anchorX: number; anchorY: number };

export interface TextOverlay {
  text: string;
  xRatio: number;
  yRatio: number;
  fontSize: number;
  color: string;
  rotation: number;
}
```

- [ ] **Step 4: 更新历史、草稿与 legacy shim**

```ts
const textOverlayToTextItem = (textOverlay: TextOverlay, id = DEFAULT_LEGACY_TEXT_ID): TextItem => ({
  id,
  content: textOverlay.text,
  xRatio: textOverlay.xRatio,
  yRatio: textOverlay.yRatio,
  fontSize: textOverlay.fontSize,
  color: textOverlay.color,
  align: 'center',
  lineHeight: 1.25,
  rotation: textOverlay.rotation ?? 0,
});

const mergeTextOverlayIntoTextItem = (text: TextItem, textOverlay: TextOverlay): TextItem => ({
  ...text,
  content: textOverlay.text,
  xRatio: textOverlay.xRatio,
  yRatio: textOverlay.yRatio,
  fontSize: textOverlay.fontSize,
  color: textOverlay.color,
  rotation: textOverlay.rotation ?? text.rotation ?? 0,
});
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm exec vitest run editor/core/src/editor-text-state.test.ts editor/core/src/history.test.ts`

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add editor/core/src/types.ts editor/core/src/history.ts editor/core/src/persistence.ts editor/core/src/editor-text-state.test.ts editor/core/src/history.test.ts
git commit -m "feat(editor-core): add text rotation state model"
```

## Task 2: 实现旋转几何、命中与手柄计算

**Files:**
- Modify: `editor/core/src/text-engine.ts`
- Modify: `editor/core/src/text-engine.test.ts`

- [ ] **Step 1: 写失败测试，锁定局部坐标与旋转手柄**

```ts
it('maps screen points into rotated local text space', () => {
  const point = toLocalTextPoint(650, 400, 600, 400, 90);
  expect(point.x).toBeCloseTo(0, 4);
  expect(point.y).toBeCloseTo(-50, 4);
});

it('resolves rotate handle point above rotated body center', () => {
  const handle = resolveTextRotateHandleScreenPoint(item, 1200, 800, displayRect, measureText);
  expect(handle).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
});

it('hits rotated text body via inverse transform', () => {
  expect(isPointInRotatedTextBlock(item, 602, 398, 1200, 800, measureText)).toBe(true);
});
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm exec vitest run editor/core/src/text-engine.test.ts`

Expected: FAIL，报旋转几何函数未定义

- [ ] **Step 3: 写最小旋转几何函数**

```ts
export const normalizeTextRotation = (rotation: number): number => {
  const normalized = ((rotation + 180) % 360 + 360) % 360 - 180;
  return Object.is(normalized, -180) ? 180 : normalized;
};

export const toLocalTextPoint = (
  pointX: number,
  pointY: number,
  anchorX: number,
  anchorY: number,
  rotation: number,
): { x: number; y: number } => {
  const radians = (-rotation * Math.PI) / 180;
  const dx = pointX - anchorX;
  const dy = pointY - anchorY;

  return {
    x: dx * Math.cos(radians) - dy * Math.sin(radians),
    y: dx * Math.sin(radians) + dy * Math.cos(radians),
  };
};
```

- [ ] **Step 4: 基于未旋转 `bodyRect` 实现逆变换命中和旋转手柄**

```ts
export const isPointInRotatedTextBlock = (...) => {
  const layout = resolveTextLayout(item, sourceWidth, sourceHeight, measureText);
  const localPoint = toLocalTextPoint(pointX, pointY, layout.anchorX, layout.anchorY, item.rotation);
  const localBodyX = layout.bodyRect.x - layout.anchorX;
  const localBodyY = layout.bodyRect.y - layout.anchorY;
  return (
    localPoint.x >= localBodyX &&
    localPoint.x <= localBodyX + layout.bodyRect.width &&
    localPoint.y >= localBodyY &&
    localPoint.y <= localBodyY + layout.bodyRect.height
  );
};
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm exec vitest run editor/core/src/text-engine.test.ts`

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add editor/core/src/text-engine.ts editor/core/src/text-engine.test.ts
git commit -m "feat(editor-core): add text rotation geometry"
```

## Task 3: 接入 editor 状态机、预览渲染与导出

**Files:**
- Modify: `editor/core/src/editor.ts`
- Modify: `editor/core/src/renderer.ts`
- Modify: `editor/core/src/image-processing.ts`
- Modify: `editor/core/src/editor-workflow.test.ts`
- Modify: `editor/core/src/image-processing.test.ts`

- [ ] **Step 1: 写失败测试，锁定旋转 workflow 与导出语义**

```ts
it('updates active text rotation and keeps one undo session', () => {
  const editor = new ImageCanvasEditor();
  editor.startTextInsertion();
  editor.placeTextAt(0.5, 0.5);
  editor.insertText('标题');
  editor.finishTextEditing();
  editor.updateActiveTextRotation(30);
  expect(editor.getState().texts[0]?.rotation).toBe(30);
});

it('exports rotated text with canvas rotation calls', () => {
  const state = makeStateWithTexts([{ ...text, rotation: 45 }]);
  createProcessedCanvas(state);
  expect(context.rotateCalls).toContainCloseTo(Math.PI / 4, 4);
});
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm exec vitest run editor/core/src/editor-workflow.test.ts editor/core/src/image-processing.test.ts`

Expected: FAIL，报 `updateActiveTextRotation` 未定义或导出未调用 `rotate`

- [ ] **Step 3: 在 `editor.ts` 增加旋转命令与交互态**

```ts
updateActiveTextRotation(rotation: number): void {
  const normalized = normalizeTextRotation(rotation);
  this.commitChange((currentState) => {
    const textState = normalizeTextState(currentState);
    const nextTexts = textState.texts.map((text) =>
      text.id === textState.activeTextId ? { ...text, rotation: normalized } : text,
    );
    return { ...currentState, ...this.createTextStatePatch(nextTexts, textState.activeTextId, textState.textToolState) };
  });
}
```

- [ ] **Step 4: 在 `renderer.ts` 与 `image-processing.ts` 使用相同旋转绘制链路**

```ts
ctx.save();
ctx.translate(layout.anchorX, layout.anchorY);
ctx.rotate((textItem.rotation * Math.PI) / 180);

for (const line of layout.lines) {
  ctx.fillText(line.text || ' ', lineBodyX - layout.anchorX, line.baselineY - layout.anchorY);
}

ctx.restore();
```

- [ ] **Step 5: 跑通过 workflow 与导出测试**

Run: `pnpm exec vitest run editor/core/src/editor-workflow.test.ts editor/core/src/image-processing.test.ts`

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add editor/core/src/editor.ts editor/core/src/renderer.ts editor/core/src/image-processing.ts editor/core/src/editor-workflow.test.ts editor/core/src/image-processing.test.ts
git commit -m "feat(editor-core): render and export rotated text"
```

## Task 4: 接入 Vue bridge、属性面板与画布旋转手柄

**Files:**
- Modify: `editor/vue3/src/useImageEditor.ts`
- Modify: `editor/vue3/src/index.ts`
- Modify: `apps/web-vue/src/App.vue`
- Modify: `apps/web-vue/src/styles.css`
- Modify: `apps/web-vue/src/components/WorkbenchIcon.vue`

- [ ] **Step 1: 写失败测试或最小桥接断言，锁定旋转值暴露**

```ts
const activeTextRotation = computed(() => activeText.value?.rotation ?? 0);
const updateActiveTextRotation = (rotation: number): void => {
  getTextEditor().updateActiveTextRotation(rotation);
};
```

- [ ] **Step 2: 在 `useImageEditor.ts` 暴露旋转 bridge**

Run: `pnpm typecheck`

Expected: FAIL，直到 `App.vue` 和导出接口同步

- [ ] **Step 3: 在 `App.vue` 增加旋转面板控件并接线**

```vue
<label class="block text-sm text-[color:var(--studio-ink-muted)]">
  <span class="mb-2 flex items-center justify-between">
    <span>旋转</span>
    <span class="text-xs text-[color:var(--studio-ink-dim)]">{{ activeTextRotation }}°</span>
  </span>
  <input
    class="input-range"
    type="range"
    min="-180"
    max="180"
    step="1"
    :disabled="!hasActiveText || !canEditText || isTextEditing"
    :value="activeTextRotation"
    @input="updateActiveTextRotation(getRangeValue($event))"
  />
</label>
```

- [ ] **Step 4: 在画布选中态显示旋转手柄并接入拖拽**

```ts
type TextHitTarget =
  | { type: 'body'; textId: string }
  | { type: 'move-handle'; textId: string }
  | { type: 'rotate-handle'; textId: string };

if (hitTarget?.type === 'rotate-handle') {
  canvas.setPointerCapture(event.pointerId);
  this.beginTextRotate(hitTarget.textId, event.clientX, event.clientY, previewMetrics);
  return;
}
```

- [ ] **Step 5: 运行类型检查**

Run: `pnpm typecheck`

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add editor/vue3/src/useImageEditor.ts editor/vue3/src/index.ts apps/web-vue/src/App.vue apps/web-vue/src/styles.css apps/web-vue/src/components/WorkbenchIcon.vue
git commit -m "feat(web-vue): add text rotation controls"
```

## Task 5: 端到端验证、回归与文档同步

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-06-text-rotation-design.md`

- [ ] **Step 1: 跑完整的定向验证**

Run:

```bash
pnpm exec vitest run editor/core/src/editor-text-state.test.ts editor/core/src/history.test.ts editor/core/src/text-engine.test.ts editor/core/src/editor-workflow.test.ts editor/core/src/image-processing.test.ts
pnpm typecheck
```

Expected: 全部 PASS

- [ ] **Step 2: 做手动冒烟**

Run: `pnpm dev`

Expected:

- 新建文字后可在右侧调角度
- 选中文字后能看到旋转手柄
- 拖动旋转手柄时角度实时变化
- 旋转后仍可拖动、编辑、导出

- [ ] **Step 3: 更新 README 的“当前能力”与文字说明**

```md
- 文字覆盖层：内容、字号、颜色、旋转、画布内拖拽与旋转手柄
```

- [ ] **Step 4: 回写 spec 的验证结果或已知偏差（如有）**

```md
## 实施结果备注

- 旋转命中采用逆变换回局部坐标
- 画布旋转手柄仅在非编辑态显示
```

- [ ] **Step 5: 提交**

```bash
git add README.md docs/superpowers/specs/2026-04-06-text-rotation-design.md
git commit -m "docs(web-vue): document text rotation capability"
```

## Self-Review

- Spec coverage:
  - 数据模型、命中、渲染、导出、面板、手柄、历史、草稿、回滚策略均已对应到 Task 1~5
  - 非目标项未进入计划
- Placeholder scan:
  - 无 `TODO` / `TBD` / “类似 Task N” 占位语句
  - 每个代码步骤都给了明确片段和命令
- Type consistency:
  - 统一使用 `rotation`、`updateActiveTextRotation`、`rotating`、`rotate-handle`
  - 命中类型和交互态命名一致
