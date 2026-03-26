# Web-Vue UI 改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前 `apps/web-vue` 页面改造成桌面优先、编辑器优先的工作室风格创作者工作台，同时保持现有编辑能力与行为兼容。

**Architecture:** 只改 `apps/web-vue` 壳层，保持 `editor-core` 与 `editor-vue` API 不变。通过拆出轻量展示组件、重排 `App.vue` 的页面骨架、统一 UnoCSS 快捷类与全局样式变量来完成视觉和交互重构。

**Tech Stack:** Vue 3 SFC、TypeScript、UnoCSS、Canvas 2D（现有内核）、`pnpm --filter @image-canvas-editor/web-vue typecheck`

---

## 执行前提

- 这个仓库当前没有 `web-vue` 的浏览器测试框架。
- 这次需求是 UI 重构，不要为了“看起来规范”临时引入 Vitest、Playwright 或新的状态库；那是过度设计。
- 自动验证以 `pnpm --filter @image-canvas-editor/web-vue typecheck` 为主，行为验证走仓库既定手工 smoke：
  `upload`、`rotate`、`flip`、`crop`、`preset`、`adjust`、`save-draft`、`restore-draft`、`export`
- 每个任务完成后都跑一次 typecheck；最后统一跑完整手工验证。

## 文件结构与职责

### 需要创建

- `apps/web-vue/src/components/WorkbenchHeader.vue`
  顶部轻量头部。只负责产品名、简短说明和高频动作按钮，不持有编辑器状态。

- `apps/web-vue/src/components/InspectorSection.vue`
  左侧折叠分组容器。只负责标题、提示文案、展开收起和当前活跃态样式。

### 需要修改

- `apps/web-vue/src/App.vue`
  页面总装配。继续调用 `useImageEditor()`，新增折叠分组状态、裁剪模式感知、空态工作台、画布舞台结构。

- `apps/web-vue/src/styles.css`
  全局视觉变量、字体栈、滑杆样式、折叠动画、空态和工作台细节。

- `apps/web-vue/uno.config.ts`
  统一快捷类：工作台面板、主按钮、次按钮、强调标签、预设卡、提示条。

## 任务分解

### Task 1: 抽出头部和折叠分组壳组件

**Files:**
- Create: `apps/web-vue/src/components/WorkbenchHeader.vue`
- Create: `apps/web-vue/src/components/InspectorSection.vue`
- Modify: `apps/web-vue/src/App.vue`

- [ ] **Step 1: 创建 `WorkbenchHeader.vue`，把头部动作从 `App.vue` 挪出去**

```vue
<script setup lang="ts">
defineProps<{
  hasImage: boolean;
}>();

const emit = defineEmits<{
  fileChange: [event: Event];
  saveDraft: [];
  restoreDraft: [];
  download: [];
}>();
</script>

<template>
  <header class="workbench-header">
    <div class="space-y-3">
      <p class="workbench-eyebrow">Image Canvas Workspace</p>
      <div class="space-y-2">
        <h1 class="workbench-title">在线图片编辑器</h1>
        <p class="workbench-copy">
          为创作者准备的轻量工作台。上传、裁剪、旋转、调色、导出，在同一块画布上完成。
        </p>
      </div>
    </div>

    <div class="header-actions">
      <label class="btn-primary cursor-pointer">
        <input class="hidden" type="file" accept="image/*" @change="emit('fileChange', $event)" />
        选择图片
      </label>
      <button class="btn-soft" type="button" :disabled="!hasImage" @click="emit('saveDraft')">保存草稿</button>
      <button class="btn-soft" type="button" @click="emit('restoreDraft')">恢复草稿</button>
      <button class="btn-primary" type="button" :disabled="!hasImage" @click="emit('download')">下载 PNG</button>
    </div>
  </header>
</template>
```

- [ ] **Step 2: 创建 `InspectorSection.vue`，提供统一折叠容器**

```vue
<script setup lang="ts">
defineProps<{
  title: string;
  hint?: string;
  open: boolean;
  tone?: 'default' | 'active';
}>();

const emit = defineEmits<{
  toggle: [];
}>();
</script>

<template>
  <section :class="['inspector-section', { 'is-open': open, 'is-active': tone === 'active' }]">
    <button class="inspector-section__trigger" type="button" @click="emit('toggle')">
      <span>
        <span class="inspector-section__title">{{ title }}</span>
        <span v-if="hint" class="inspector-section__hint">{{ hint }}</span>
      </span>
      <span class="inspector-section__chevron">{{ open ? '−' : '+' }}</span>
    </button>

    <div v-show="open" class="inspector-section__body">
      <slot />
    </div>
  </section>
</template>
```

- [ ] **Step 3: 在 `App.vue` 中接入新头部组件，但暂时不重排左侧面板**

```vue
<script setup lang="ts">
import WorkbenchHeader from './components/WorkbenchHeader.vue';

// 保留现有 useImageEditor 解构，不改 API
</script>

<template>
  <div class="app-shell">
    <div class="app-frame">
      <WorkbenchHeader
        :has-image="hasImage"
        @file-change="onFileChange"
        @save-draft="saveCurrentDraft"
        @restore-draft="restoreCurrentDraft"
        @download="download"
      />

      <!-- 先保留现有 main 布局，下一任务再重排 -->
    </div>
  </div>
</template>
```

- [ ] **Step 4: 运行 typecheck，确认组件拆分没有破坏类型**

Run:

```bash
pnpm --filter @image-canvas-editor/web-vue typecheck
```

Expected:

```text
> @image-canvas-editor/web-vue@0.1.0 typecheck
> tsc --noEmit
```

- [ ] **Step 5: 提交这一小步**

```bash
git add apps/web-vue/src/components/WorkbenchHeader.vue apps/web-vue/src/components/InspectorSection.vue apps/web-vue/src/App.vue
git commit -m "feat(web-vue): extract workbench shell components"
```

### Task 2: 重排 `App.vue` 为编辑器优先工作台

**Files:**
- Modify: `apps/web-vue/src/App.vue`
- Reuse: `apps/web-vue/src/components/WorkbenchHeader.vue`
- Reuse: `apps/web-vue/src/components/InspectorSection.vue`

- [ ] **Step 1: 给 `App.vue` 增加折叠分组状态和裁剪模式感知**

```ts
import { computed, reactive, watch } from 'vue';
import InspectorSection from './components/InspectorSection.vue';

type SectionId = 'meta' | 'transform' | 'crop' | 'preset' | 'adjust';

const sectionOpen = reactive<Record<SectionId, boolean>>({
  meta: true,
  transform: true,
  crop: false,
  preset: false,
  adjust: true,
});

const isCropMode = computed(() => state.value.cropMode);
const stageHint = computed(() => {
  if (!hasImage.value) {
    return '导入一张图片开始工作台编辑。';
  }

  return isCropMode.value
    ? '拖拽框选裁剪区域，拖动内部移动，四角缩放。'
    : '滚轮缩放、拖拽平移、双击复位视图。';
});

const toggleSection = (section: SectionId): void => {
  sectionOpen[section] = !sectionOpen[section];
};

watch(
  () => state.value.cropMode,
  (cropMode) => {
    if (cropMode) {
      sectionOpen.crop = true;
    }
  },
);
```

- [ ] **Step 2: 把左侧控制区改成折叠分组，保留原有按钮和绑定**

```vue
<aside class="inspector-column">
  <InspectorSection title="图片信息" hint="文件与状态" :open="sectionOpen.meta" @toggle="toggleSection('meta')">
    <dl class="meta-grid">
      <template v-for="item in imageMetaRows" :key="item.label">
        <dt>{{ item.label }}</dt>
        <dd>{{ item.value }}</dd>
      </template>
    </dl>
  </InspectorSection>

  <InspectorSection
    title="旋转与翻转"
    hint="几何变换"
    :open="sectionOpen.transform"
    @toggle="toggleSection('transform')"
  >
    <!-- 直接搬现有旋转、翻转、角度滑杆 -->
  </InspectorSection>

  <InspectorSection
    title="裁剪"
    hint="裁剪区域"
    :open="sectionOpen.crop"
    :tone="isCropMode ? 'active' : 'default'"
    @toggle="toggleSection('crop')"
  >
    <!-- 直接搬现有进入裁剪 / 清除裁剪 / 应用 / 取消按钮 -->
  </InspectorSection>

  <InspectorSection title="滤镜预设" hint="快速风格" :open="sectionOpen.preset" @toggle="toggleSection('preset')">
    <!-- 直接搬现有 PRESET_OPTIONS -->
  </InspectorSection>

  <InspectorSection title="参数调节" hint="精细微调" :open="sectionOpen.adjust" @toggle="toggleSection('adjust')">
    <!-- 直接搬现有 contrast / exposure / highlights 滑杆 -->
  </InspectorSection>
</aside>
```

- [ ] **Step 3: 把中间画布区改成工作台舞台，并补空态与模式提示**

```vue
<section class="stage-panel">
  <div class="stage-toolbar">
    <span class="stage-zoom">{{ zoomText }}</span>
    <button class="btn-soft px-2 py-1" type="button" :disabled="!hasImage" @click="zoomOut">缩小</button>
    <button class="btn-soft px-2 py-1" type="button" :disabled="!hasImage" @click="zoomIn">放大</button>
    <button class="btn-soft px-2 py-1" type="button" :disabled="!hasImage" @click="resetViewport">复位视图</button>
  </div>

  <div class="stage-surface">
    <canvas ref="canvasRef" class="editor-canvas" />

    <div v-if="!hasImage" class="stage-empty">
      <p class="stage-empty__eyebrow">Studio Workspace</p>
      <h2>导入一张图片，开始这次编辑。</h2>
      <p>保留原图，直接在同一块画布里完成裁剪、旋转、预设和导出。</p>
    </div>
  </div>

  <div class="stage-footer">
    <div class="stage-hint">
      <span class="stage-hint__label">{{ isCropMode ? '裁剪模式' : '浏览模式' }}</span>
      <p>{{ stageHint }}</p>
    </div>
  </div>
</section>
```

- [ ] **Step 4: 运行 typecheck，确认折叠状态和画布结构都能通过**

Run:

```bash
pnpm --filter @image-canvas-editor/web-vue typecheck
```

Expected:

```text
> @image-canvas-editor/web-vue@0.1.0 typecheck
> tsc --noEmit
```

- [ ] **Step 5: 提交工作台骨架**

```bash
git add apps/web-vue/src/App.vue
git commit -m "feat(web-vue): rebuild editor-first workbench layout"
```

### Task 3: 建立工作室风格视觉系统

**Files:**
- Modify: `apps/web-vue/uno.config.ts`
- Modify: `apps/web-vue/src/styles.css`

- [ ] **Step 1: 在 `uno.config.ts` 里重写快捷类，建立统一面板、按钮和舞台外观**

```ts
export default defineConfig({
  presets: [presetUno()],
  shortcuts: {
    'app-shell':
      'min-h-screen bg-[radial-gradient(circle_at_top,_rgba(246,201,150,0.12),_transparent_28%),linear-gradient(180deg,#181411_0%,#231c17_52%,#130f0d_100%)] text-stone-100',
    'app-frame': 'mx-auto max-w-[1680px] px-4 py-5 md:px-6 xl:px-8',
    'workbench-header': 'mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between',
    'workbench-panel':
      'rounded-[28px] border border-white/8 bg-[rgba(247,240,230,0.06)] shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur',
    'inspector-column': 'space-y-3',
    'stage-panel': 'workbench-panel relative min-h-[720px] overflow-hidden p-4 xl:p-5',
    'btn-base': 'inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium transition',
    'btn-soft':
      'btn-base border border-white/10 bg-white/6 text-stone-100 hover:border-amber-200/30 hover:bg-white/10 disabled:opacity-45',
    'btn-primary':
      'btn-base bg-[linear-gradient(135deg,#f0c48a,#d79b61)] text-stone-950 hover:brightness-105 disabled:opacity-45',
    'preset-btn':
      'inline-flex min-h-[72px] items-end rounded-[20px] border border-white/10 px-3 py-3 text-left text-xs transition',
  },
});
```

- [ ] **Step 2: 在 `styles.css` 里加入暖中性色变量、字体栈和滑杆新样式**

```css
:root {
  color-scheme: dark;
  --app-bg: #181411;
  --panel-bg: rgba(247, 240, 230, 0.06);
  --panel-border: rgba(255, 255, 255, 0.1);
  --text-main: #f5efe7;
  --text-muted: #c6b8aa;
  --text-soft: #9f9285;
  --accent: #d9a56b;
  --accent-strong: #f1c78f;
  font-family:
    "Avenir Next",
    "PingFang SC",
    "Microsoft YaHei",
    sans-serif;
}

body {
  margin: 0;
  min-height: 100%;
  background: var(--app-bg);
  color: var(--text-main);
}

.input-range::-webkit-slider-runnable-track,
.input-range::-moz-range-track {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
}

.input-range::-webkit-slider-thumb,
.input-range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 999px;
  background: var(--accent-strong);
  box-shadow: 0 0 0 4px rgba(217, 165, 107, 0.18);
}
```

- [ ] **Step 3: 补足折叠区、工作台和空态细节类，避免所有样式堆在模板内联**

```css
.inspector-section {
  border: 1px solid var(--panel-border);
  border-radius: 24px;
  background: var(--panel-bg);
  overflow: hidden;
}

.inspector-section.is-active {
  border-color: rgba(217, 165, 107, 0.42);
  box-shadow: inset 0 0 0 1px rgba(217, 165, 107, 0.18);
}

.inspector-section__trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.1rem;
  background: transparent;
  color: inherit;
  border: 0;
}

.stage-surface {
  position: relative;
  min-height: 560px;
  border-radius: 24px;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(255, 251, 245, 0.06), rgba(255, 255, 255, 0.02)),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.025) 0 1px, transparent 1px 22px),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.025) 0 1px, transparent 1px 22px);
}

.stage-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 0.75rem;
  text-align: center;
  padding: 2rem;
}
```

- [ ] **Step 4: 运行 typecheck，确认样式重构没有误删类名或脚本导入**

Run:

```bash
pnpm --filter @image-canvas-editor/web-vue typecheck
```

Expected:

```text
> @image-canvas-editor/web-vue@0.1.0 typecheck
> tsc --noEmit
```

- [ ] **Step 5: 提交视觉系统 patch**

```bash
git add apps/web-vue/uno.config.ts apps/web-vue/src/styles.css
git commit -m "feat(web-vue): apply studio visual system"
```

### Task 4: 做状态细节打磨并完成最终验证

**Files:**
- Modify: `apps/web-vue/src/App.vue`
- Modify: `apps/web-vue/src/styles.css`

- [ ] **Step 1: 把预设按钮、模式提示和读数层级做完整，不留“旧样式漏网之鱼”**

```vue
<div class="grid grid-cols-2 gap-2">
  <button
    v-for="item in PRESET_OPTIONS"
    :key="item.value"
    type="button"
    :class="getPresetButtonClass(item.value)"
    @click="applyPreset(item.value)"
  >
    <span class="block text-[11px] uppercase tracking-[0.22em] text-stone-400">Preset</span>
    <span class="mt-2 block text-sm font-medium text-stone-100">{{ item.label }}</span>
  </button>
</div>

<span class="stage-hint__label">
  {{ isCropMode ? '裁剪模式' : '浏览模式' }}
</span>
<span class="text-xs text-stone-400">{{ rotationText }} / {{ zoomText }}</span>
```

- [ ] **Step 2: 补响应式兜底，保证窄屏下不炸布局**

```css
@media (max-width: 1279px) {
  .stage-panel {
    min-height: 620px;
  }
}

@media (max-width: 1023px) {
  .header-actions {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .stage-toolbar {
    position: static;
    margin-bottom: 0.75rem;
  }
}

@media (max-width: 767px) {
  .stage-surface {
    min-height: 420px;
  }
}
```

- [ ] **Step 3: 运行最终 typecheck**

Run:

```bash
pnpm --filter @image-canvas-editor/web-vue typecheck
```

Expected:

```text
> @image-canvas-editor/web-vue@0.1.0 typecheck
> tsc --noEmit
```

- [ ] **Step 4: 运行手工 smoke，逐项记录结果**

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

1. 上传一张图片，确认空态消失、画布正常显示。
2. 左转 90°、右转 90°，确认画布与数值同步。
3. 水平翻转、垂直翻转，确认结果正确。
4. 进入裁剪，确认左侧 `裁剪` 分组高亮并自动展开；应用、取消、清除都要试。
5. 切换任意两个滤镜预设，确认高亮态和画面同步变化。
6. 调整对比度、曝光、高光，确认读数和画面变化一致。
7. 保存草稿后刷新页面，再执行恢复草稿，确认恢复成功。
8. 导出 PNG，确认文件名和下载行为正常。
9. 缩放、平移、双击复位视图，确认工作台提示与行为一致。

- [ ] **Step 5: 提交最终 polish**

```bash
git add apps/web-vue/src/App.vue apps/web-vue/src/styles.css
git commit -m "feat(web-vue): polish studio workbench states"
```

## 计划自检

### Spec coverage

- `编辑器优先工作台结构`：Task 2
- `工作室编辑风视觉`：Task 3
- `分组折叠工具区`：Task 1 + Task 2
- `空态 / 裁剪态 / 缩放提示`：Task 2 + Task 4
- `桌面优先，移动端只兜底`：Task 4
- `不破坏上传、裁剪、导出、草稿`：Task 2 与 Task 4 的 smoke

### Placeholder scan

- 没有 `TODO`、`TBD`、`later`
- 每个任务都给了明确文件、代码骨架、命令和预期结果
- 没有引用未定义的新状态库或新测试框架

### Type consistency

- 折叠分组状态统一使用 `SectionId`
- 裁剪态统一读取 `state.value.cropMode`
- 头部动作统一通过 `WorkbenchHeader` emit 回传，未改 `useImageEditor()` 方法名
