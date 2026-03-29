# Figma 风格工作台 UI 重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `apps/web-vue` 改造成使用 `UnoCSS` 的固定工作台 UI，支持明暗双主题、SVG 图标加文字的关键操作入口，并保证画布首屏优先且整页不滚动。

**Architecture:** 只改 `apps/web-vue` 壳层。`App.vue` 负责固定工作台骨架、移动端抽屉和主题状态；`WorkbenchHeader.vue`、`InspectorSection.vue`、新建图标组件只负责展示；`uno.config.ts` 和 `styles.css` 负责统一快捷类与主题变量。`editor-core` / `editor-vue` API 不变。

**Tech Stack:** Vue 3 SFC、TypeScript、UnoCSS、CSS 变量、Vite、`pnpm --filter @image-canvas-editor/web-vue typecheck`

---

## 文件结构与职责

### 需要创建

- `apps/web-vue/src/components/WorkbenchIcon.vue`
  本地图标渲染组件。只负责输出一组受控的内联 SVG，不引入外部图标库。

### 需要修改

- `apps/web-vue/src/App.vue`
  页面总装配。继续调用 `useImageEditor()`，新增主题状态、移动端抽屉状态、固定工作台骨架和图标按钮入口。

- `apps/web-vue/src/components/WorkbenchHeader.vue`
  顶部固定栏。补主题切换、图标按钮和更紧凑的工具条结构。

- `apps/web-vue/src/components/InspectorSection.vue`
  左侧分组壳。保留折叠能力，增强标题区布局和更紧凑的工作台样式。

- `apps/web-vue/src/styles.css`
  全局主题变量、固定布局、滚动边界、工作台视觉、移动端抽屉、图标按钮细节。

- `apps/web-vue/uno.config.ts`
  统一工作台快捷类，包括主框架、图标按钮、主题切换、抽屉、状态条。

## 执行前提

- 当前 `web-vue` 没有浏览器级测试框架。
- 这次是 UI 重构，不要临时引入 Playwright、Vitest DOM 测试、图标库或状态库；那是典型过度设计。
- 自动验证以 `pnpm --filter @image-canvas-editor/web-vue typecheck` 为主。
- 行为验证走仓库既定手工 smoke：`upload`、`rotate`、`flip`、`crop`、`text`、`preset`、`adjust`、`undo`、`redo`、`save-draft`、`restore-draft`、`export`、`theme-toggle`。

## Task 1: 建立本地图标组件和头部接口

**Files:**
- Create: `apps/web-vue/src/components/WorkbenchIcon.vue`
- Modify: `apps/web-vue/src/components/WorkbenchHeader.vue`
- Modify: `apps/web-vue/src/App.vue`

- [ ] **Step 1: 创建 `WorkbenchIcon.vue`，定义受控图标集合**

```vue
<script setup lang="ts">
type IconName =
  | 'upload'
  | 'download'
  | 'draft-save'
  | 'draft-restore'
  | 'theme-light'
  | 'theme-dark'
  | 'undo'
  | 'redo'
  | 'zoom-in'
  | 'zoom-out'
  | 'viewport-reset'
  | 'rotate-left'
  | 'rotate-right'
  | 'flip-horizontal'
  | 'flip-vertical'
  | 'crop'
  | 'crop-apply'
  | 'crop-cancel'
  | 'text'
  | 'text-remove';

const props = withDefaults(
  defineProps<{
    name: IconName;
    size?: number;
    strokeWidth?: number;
  }>(),
  {
    size: 16,
    strokeWidth: 1.75,
  },
);
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    :stroke-width="props.strokeWidth"
    aria-hidden="true"
  >
    <template v-if="props.name === 'upload'">
      <path d="M12 16V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M4 20h16" />
    </template>
    <template v-else-if="props.name === 'rotate-left'">
      <path d="M7 8H3V4" />
      <path d="M3 8a9 9 0 101.9-2.7" />
    </template>
    <template v-else-if="props.name === 'crop'">
      <path d="M7 3v14a2 2 0 002 2h12" />
      <path d="M17 21V7a2 2 0 00-2-2H3" />
    </template>
    <!-- 其余图标按同样方式补齐 -->
  </svg>
</template>
```

- [ ] **Step 2: 运行 typecheck，确认新组件类型合法**

Run:

```bash
pnpm --filter @image-canvas-editor/web-vue typecheck
```

Expected:

```text
> @image-canvas-editor/web-vue@0.1.0 typecheck
> tsc --noEmit
```

- [ ] **Step 3: 修改 `WorkbenchHeader.vue`，让头部支持主题切换和图标按钮**

```vue
<script setup lang="ts">
import WorkbenchIcon from './WorkbenchIcon.vue';

const props = defineProps<{
  hasImage: boolean;
  editingLocked: boolean;
  theme: 'light' | 'dark';
}>();

const emit = defineEmits<{
  (event: 'fileChange', payload: Event): void;
  (event: 'saveDraft'): void;
  (event: 'restoreDraft'): void;
  (event: 'download'): void;
  (event: 'toggleTheme'): void;
}>();
</script>

<template>
  <header class="workbench-header">
    <div class="workbench-header__copy">
      <p class="workbench-header__eyebrow">Canvas Workspace</p>
      <h1 class="workbench-header__title">在线图片编辑器</h1>
      <p class="workbench-header__text">固定工作台、明暗主题、首屏画布优先。</p>
    </div>

    <div class="workbench-header__actions">
      <button class="btn-icon-toggle" type="button" @click="emit('toggleTheme')">
        <WorkbenchIcon :name="props.theme === 'light' ? 'theme-dark' : 'theme-light'" />
        <span>{{ props.theme === 'light' ? '深色' : '浅色' }}</span>
      </button>

      <label class="btn-primary cursor-pointer" :class="{ 'pointer-events-none opacity-60': props.editingLocked }">
        <input class="hidden" type="file" accept="image/*" :disabled="props.editingLocked" @change="emit('fileChange', $event)" />
        <WorkbenchIcon name="upload" />
        <span>选择图片</span>
      </label>
    </div>
  </header>
</template>
```

- [ ] **Step 4: 在 `App.vue` 里接入头部新参数，但先不重排整体布局**

```ts
const theme = ref<'light' | 'dark'>('light');

const toggleTheme = (): void => {
  theme.value = theme.value === 'light' ? 'dark' : 'light';
};
```

```vue
<WorkbenchHeader
  :has-image="hasImage"
  :editing-locked="isCropMode"
  :theme="theme"
  @file-change="onFileChange"
  @save-draft="saveCurrentDraft"
  @restore-draft="restoreCurrentDraft"
  @download="download"
  @toggle-theme="toggleTheme"
/>
```

- [ ] **Step 5: 再跑一次 typecheck，确认头部接口没有断**

Run:

```bash
pnpm --filter @image-canvas-editor/web-vue typecheck
```

Expected:

```text
> @image-canvas-editor/web-vue@0.1.0 typecheck
> tsc --noEmit
```

- [ ] **Step 6: 提交图标基础设施 patch**

```bash
git add apps/web-vue/src/components/WorkbenchIcon.vue apps/web-vue/src/components/WorkbenchHeader.vue apps/web-vue/src/App.vue
git commit -m "feat(web-vue): add workbench icon actions"
```

## Task 2: 重排 `App.vue` 为固定工作台骨架

**Files:**
- Modify: `apps/web-vue/src/App.vue`
- Modify: `apps/web-vue/src/components/InspectorSection.vue`

- [ ] **Step 1: 在 `App.vue` 新增桌面固定布局和移动端抽屉状态**

```ts
type SectionId = 'meta' | 'transform' | 'crop' | 'text' | 'preset' | 'adjust';

const sectionOpen = reactive<Record<SectionId, boolean>>({
  meta: true,
  transform: true,
  crop: false,
  text: true,
  preset: false,
  adjust: true,
});

const isInspectorOpen = ref(false);

const openInspector = (): void => {
  isInspectorOpen.value = true;
};

const closeInspector = (): void => {
  isInspectorOpen.value = false;
};
```

- [ ] **Step 2: 用固定框架替换当前自然流容器**

```vue
<template>
  <div class="app-shell" :data-theme="theme">
    <div class="app-shell__frame">
      <WorkbenchHeader
        :has-image="hasImage"
        :editing-locked="isCropMode"
        :theme="theme"
        @file-change="onFileChange"
        @save-draft="saveCurrentDraft"
        @restore-draft="restoreCurrentDraft"
        @download="download"
        @toggle-theme="toggleTheme"
      />

      <main class="workbench-layout">
        <aside class="workbench-sidebar" :class="{ 'is-open': isInspectorOpen }">
          <div class="workbench-sidebar__scroll">
            <!-- InspectorSection 分组沿用现有绑定 -->
          </div>
        </aside>

        <section class="workbench-stage">
          <div class="workbench-stage__toolbar">
            <!-- 撤销 / 重做 / 缩放 / 复位 -->
          </div>

          <div class="workbench-stage__surface">
            <canvas ref="canvasRef" class="workbench-canvas" />
          </div>
        </section>
      </main>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 把右侧工具条改成图标加文字按钮**

```vue
<div class="workbench-stage__toolbar">
  <button class="btn-icon-soft" type="button" :disabled="!canUndo || isCropMode" @click="undo">
    <WorkbenchIcon name="undo" />
    <span>撤销</span>
  </button>
  <button class="btn-icon-soft" type="button" :disabled="!canRedo || isCropMode" @click="redo">
    <WorkbenchIcon name="redo" />
    <span>重做</span>
  </button>
  <button class="btn-icon-soft" type="button" :disabled="!hasImage || isCropMode" @click="zoomOut">
    <WorkbenchIcon name="zoom-out" />
    <span>缩小</span>
  </button>
  <button class="btn-icon-soft" type="button" :disabled="!hasImage || isCropMode" @click="zoomIn">
    <WorkbenchIcon name="zoom-in" />
    <span>放大</span>
  </button>
</div>
```

- [ ] **Step 4: 修改 `InspectorSection.vue`，保证固定侧栏中的分组头更紧凑**

```vue
<template>
  <section :class="['inspector-section', { 'is-open': props.open, 'is-active': props.tone === 'accent' }]">
    <button
      class="inspector-section__trigger"
      type="button"
      :aria-expanded="props.open"
      :aria-controls="contentId"
      @click="emit('toggle', !props.open)"
    >
      <span class="inspector-section__copy">
        <span class="inspector-section__title">{{ props.title }}</span>
        <span v-if="props.hint" class="inspector-section__hint" :class="hintClass">{{ props.hint }}</span>
      </span>
      <span class="inspector-section__chevron" aria-hidden="true">{{ props.open ? '−' : '+' }}</span>
    </button>

    <div v-show="props.open" :id="contentId" class="inspector-section__body">
      <slot />
    </div>
  </section>
</template>
```

- [ ] **Step 5: 跑 typecheck，确认固定工作台骨架不破坏类型**

Run:

```bash
pnpm --filter @image-canvas-editor/web-vue typecheck
```

Expected:

```text
> @image-canvas-editor/web-vue@0.1.0 typecheck
> tsc --noEmit
```

- [ ] **Step 6: 提交固定工作台骨架 patch**

```bash
git add apps/web-vue/src/App.vue apps/web-vue/src/components/InspectorSection.vue
git commit -m "feat(web-vue): rebuild fixed workbench layout"
```

## Task 3: 把左侧关键入口改成 SVG 图标加文字

**Files:**
- Modify: `apps/web-vue/src/App.vue`
- Reuse: `apps/web-vue/src/components/WorkbenchIcon.vue`

- [ ] **Step 1: 把旋转与翻转按钮升级为图标按钮**

```vue
<div class="tool-grid-two">
  <button class="btn-icon-soft" type="button" :disabled="!hasImage || isCropMode" @click="rotateBy(-90)">
    <WorkbenchIcon name="rotate-left" />
    <span>左转 90°</span>
  </button>
  <button class="btn-icon-soft" type="button" :disabled="!hasImage || isCropMode" @click="rotateBy(90)">
    <WorkbenchIcon name="rotate-right" />
    <span>右转 90°</span>
  </button>
  <button class="btn-icon-soft" type="button" :disabled="!hasImage || isCropMode" @click="toggleFlip('flipX')">
    <WorkbenchIcon name="flip-horizontal" />
    <span>水平翻转</span>
  </button>
  <button class="btn-icon-soft" type="button" :disabled="!hasImage || isCropMode" @click="toggleFlip('flipY')">
    <WorkbenchIcon name="flip-vertical" />
    <span>垂直翻转</span>
  </button>
</div>
```

- [ ] **Step 2: 把裁剪和文字组的高频操作入口也统一成图标按钮**

```vue
<div class="tool-grid-two">
  <button class="btn-icon-soft" type="button" :disabled="!hasImage || isCropMode" @click="enterCropMode">
    <WorkbenchIcon name="crop" />
    <span>进入裁剪</span>
  </button>
  <button class="btn-icon-soft" type="button" :disabled="!hasImage" @click="resetCrop">
    <WorkbenchIcon name="crop-cancel" />
    <span>清除裁剪</span>
  </button>
  <button class="btn-icon-primary" type="button" :disabled="!canApplyCrop" @click="applyCrop">
    <WorkbenchIcon name="crop-apply" />
    <span>应用裁剪</span>
  </button>
  <button class="btn-icon-soft" type="button" :disabled="!canCancelCrop" @click="cancelCrop">
    <WorkbenchIcon name="crop-cancel" />
    <span>取消裁剪</span>
  </button>
</div>
```

- [ ] **Step 3: 保持文本输入、滑杆、预设区不做无意义图标化**

```vue
<!-- 保持这类控件以内容本身为主，不额外加图标噪音 -->
<label class="block text-sm text-[color:var(--studio-ink-muted)]">
  <span class="mb-2 flex items-center justify-between">
    <span>任意角度</span>
    <span class="text-xs text-[color:var(--studio-ink-dim)]">{{ rotationText }}</span>
  </span>
  <input
    class="input-range"
    type="range"
    min="-180"
    max="180"
    step="1"
    :disabled="!hasImage || isCropMode"
    :value="state.transform.rotation"
    @input="previewRotation(getRangeValue($event))"
    @change="commitRotation(getRangeValue($event))"
  />
</label>
```

- [ ] **Step 4: 跑 typecheck，确认按钮替换没有打断事件绑定**

Run:

```bash
pnpm --filter @image-canvas-editor/web-vue typecheck
```

Expected:

```text
> @image-canvas-editor/web-vue@0.1.0 typecheck
> tsc --noEmit
```

- [ ] **Step 5: 提交图标入口 patch**

```bash
git add apps/web-vue/src/App.vue
git commit -m "feat(web-vue): add svg icon action buttons"
```

## Task 4: 用 `UnoCSS + CSS 变量` 建立明暗双主题

**Files:**
- Modify: `apps/web-vue/uno.config.ts`
- Modify: `apps/web-vue/src/styles.css`

- [ ] **Step 1: 在 `uno.config.ts` 建立工作台快捷类**

```ts
import { defineConfig, presetUno } from 'unocss';

export default defineConfig({
  presets: [presetUno()],
  shortcuts: {
    'app-shell': 'h-screen overflow-hidden bg-[color:var(--app-bg)] text-[color:var(--app-ink)]',
    'workbench-layout': 'grid h-[calc(100vh-var(--header-height))] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]',
    'workbench-sidebar': 'hidden lg:block',
    'btn-icon-soft':
      'btn-base inline-flex items-center justify-center gap-2 rounded-3 border border-[color:var(--app-border)] bg-[color:var(--panel-muted)] text-[color:var(--app-ink)] hover:bg-[color:var(--panel-hover)]',
    'btn-icon-primary':
      'btn-base inline-flex items-center justify-center gap-2 rounded-3 bg-[color:var(--accent)] text-[color:var(--accent-ink)] hover:bg-[color:var(--accent-strong)]',
    'btn-icon-toggle':
      'btn-base inline-flex items-center justify-center gap-2 rounded-3 border border-[color:var(--app-border)] bg-[color:var(--panel-bg)] text-[color:var(--app-ink)]',
  },
});
```

- [ ] **Step 2: 在 `styles.css` 建立浅色和深色主题变量**

```css
:root {
  --header-height: 76px;
}

.app-shell[data-theme='light'] {
  --app-bg: #eef2f7;
  --app-ink: #172033;
  --app-muted: #5b667d;
  --app-border: rgba(23, 32, 51, 0.1);
  --panel-bg: #ffffff;
  --panel-muted: #f6f8fb;
  --panel-hover: #eef3f9;
  --accent: #2f6df6;
  --accent-strong: #1f5ee9;
  --accent-ink: #ffffff;
  --canvas-bg: #f2f5fa;
}

.app-shell[data-theme='dark'] {
  --app-bg: #0d1118;
  --app-ink: #eef4ff;
  --app-muted: #97a3b8;
  --app-border: rgba(238, 244, 255, 0.1);
  --panel-bg: #151c27;
  --panel-muted: #101722;
  --panel-hover: #1a2331;
  --accent: #6ea1ff;
  --accent-strong: #89b2ff;
  --accent-ink: #0b1320;
  --canvas-bg: #121925;
}
```

- [ ] **Step 3: 补固定布局、左栏滚动、画布表面和移动端抽屉样式**

```css
.workbench-sidebar {
  min-height: 0;
}

.workbench-sidebar__scroll {
  height: 100%;
  overflow-y: auto;
  padding-right: 4px;
}

.workbench-stage {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
}

.workbench-stage__surface {
  position: relative;
  min-height: 0;
  border: 1px solid var(--app-border);
  border-radius: 24px;
  background: var(--canvas-bg);
  overflow: hidden;
}

@media (max-width: 1023px) {
  .workbench-sidebar {
    position: fixed;
    inset: var(--header-height) auto 0 0;
    width: min(88vw, 320px);
    transform: translateX(-100%);
    transition: transform 0.22s ease;
    z-index: 30;
  }

  .workbench-sidebar.is-open {
    transform: translateX(0);
  }
}
```

- [ ] **Step 4: 跑 typecheck，确认样式和 Uno 配置没有误删类名**

Run:

```bash
pnpm --filter @image-canvas-editor/web-vue typecheck
```

Expected:

```text
> @image-canvas-editor/web-vue@0.1.0 typecheck
> tsc --noEmit
```

- [ ] **Step 5: 提交主题系统 patch**

```bash
git add apps/web-vue/uno.config.ts apps/web-vue/src/styles.css
git commit -m "feat(web-vue): add dual-theme workbench tokens"
```

## Task 5: 移动端抽屉、锁滚和最终验证

**Files:**
- Modify: `apps/web-vue/src/App.vue`
- Modify: `apps/web-vue/src/styles.css`

- [ ] **Step 1: 给移动端补“打开工具栏”入口和遮罩**

```vue
<button class="btn-icon-soft lg:hidden" type="button" @click="openInspector">
  <WorkbenchIcon name="crop" />
  <span>工具栏</span>
</button>

<button
  v-if="isInspectorOpen"
  class="workbench-sidebar__backdrop"
  type="button"
  aria-label="关闭工具栏"
  @click="closeInspector"
/>
```

- [ ] **Step 2: 用 `watch` 锁定移动端抽屉打开时的页面滚动**

```ts
watch(isInspectorOpen, (nextOpen) => {
  if (typeof document === 'undefined') {
    return;
  }

  document.body.style.overflow = nextOpen ? 'hidden' : '';
});
```

- [ ] **Step 3: 补抽屉关闭联动，避免模式切换后侧栏状态残留**

```ts
watch(
  () => state.value.cropMode,
  (next) => {
    if (next) {
      sectionOpen.crop = true;
    }
  },
);

watch(
  () => hasImage.value,
  () => {
    if (!window.matchMedia('(max-width: 1023px)').matches) {
      return;
    }

    closeInspector();
  },
);
```

- [ ] **Step 4: 运行最终 typecheck**

Run:

```bash
pnpm --filter @image-canvas-editor/web-vue typecheck
```

Expected:

```text
> @image-canvas-editor/web-vue@0.1.0 typecheck
> tsc --noEmit
```

- [ ] **Step 5: 启动本地站点并做手工 smoke**

Run:

```bash
pnpm dev
```

Expected:

```text
VITE v4.x  ready in ...
Local:   http://localhost:5173/
```

手工检查顺序：

1. 桌面端加载后确认没有页面级纵向滚动条。
2. 顶部固定、左栏固定、画布首屏可见。
3. 展开多个分组后，只左栏内部滚动。
4. 切换浅色/深色主题，确认文字、边框、按钮、画布容器都可读。
5. 试一次上传、左转、右转、水平翻转、垂直翻转。
6. 进入裁剪，确认分组自动展开且图标按钮可用；再试应用、取消、清除。
7. 添加文字、删除文字、修改字号和颜色。
8. 试两个滤镜预设和三个调节滑杆。
9. 试撤销、重做、缩放、复位视图。
10. 保存草稿、刷新后恢复草稿、导出 PNG。
11. 切到移动端宽度，确认抽屉打开时背景锁滚，关闭后恢复。

- [ ] **Step 6: 提交最终 polish**

```bash
git add apps/web-vue/src/App.vue apps/web-vue/src/styles.css
git commit -m "feat(web-vue): polish responsive workbench interactions"
```

## 计划自检

### Spec coverage

- `固定头部 + 固定左栏 + 画布优先`：Task 2
- `整页不滚动，左栏内部滚动`：Task 2 + Task 4
- `使用 UnoCSS`：Task 4
- `明暗双主题`：Task 1 + Task 4 + Task 5
- `SVG 图标 + 文字`：Task 1 + Task 3
- `移动端抽屉降级`：Task 2 + Task 4 + Task 5
- `不改 editor-core / editor-vue 行为`：所有任务都只落在 `apps/web-vue`

### Placeholder scan

- 没有 `TODO`、`TBD`、`later`
- 每个任务都给了明确文件、代码骨架、命令和预期结果
- 没有引用未定义的新状态库或第三方图标库

### Type consistency

- 主题状态统一为 `theme: 'light' | 'dark'`
- 侧栏状态统一为 `isInspectorOpen`
- 图标组件统一用 `WorkbenchIcon`
- 左栏分组仍沿用 `SectionId`
