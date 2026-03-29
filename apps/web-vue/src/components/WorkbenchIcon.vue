<script setup lang="ts">
import { computed } from 'vue';

type IconName =
  | 'upload'
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
  | 'text-remove'
  | 'download'
  | 'draft-save'
  | 'draft-restore';

type IconTag = 'circle' | 'line' | 'path' | 'polyline' | 'rect';

type IconNode = {
  tag: IconTag;
  attrs: Record<string, number | string>;
};

type IconDefinition = {
  viewBox: string;
  nodes: IconNode[];
};

const props = withDefaults(
  defineProps<{
    name: IconName;
    size?: number;
  }>(),
  {
    size: 16,
  },
);

const ICONS = {
  upload: {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'path', attrs: { d: 'M12 15V4' } },
      { tag: 'polyline', attrs: { points: '8 8 12 4 16 8' } },
      { tag: 'path', attrs: { d: 'M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3' } },
    ],
  },
  'theme-light': {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'circle', attrs: { cx: 12, cy: 12, r: 4 } },
      { tag: 'path', attrs: { d: 'M12 2v2' } },
      { tag: 'path', attrs: { d: 'M12 20v2' } },
      { tag: 'path', attrs: { d: 'M4.93 4.93l1.41 1.41' } },
      { tag: 'path', attrs: { d: 'M17.66 17.66l1.41 1.41' } },
      { tag: 'path', attrs: { d: 'M2 12h2' } },
      { tag: 'path', attrs: { d: 'M20 12h2' } },
      { tag: 'path', attrs: { d: 'M4.93 19.07l1.41-1.41' } },
      { tag: 'path', attrs: { d: 'M17.66 6.34l1.41-1.41' } },
    ],
  },
  'theme-dark': {
    viewBox: '0 0 24 24',
    nodes: [{ tag: 'path', attrs: { d: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z' } }],
  },
  undo: {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'polyline', attrs: { points: '9 14 4 9 9 4' } },
      { tag: 'path', attrs: { d: 'M20 20a8 8 0 0 0-8-8H4' } },
    ],
  },
  redo: {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'polyline', attrs: { points: '15 4 20 9 15 14' } },
      { tag: 'path', attrs: { d: 'M4 20a8 8 0 0 1 8-8h8' } },
    ],
  },
  'zoom-in': {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'circle', attrs: { cx: 11, cy: 11, r: 6 } },
      { tag: 'path', attrs: { d: 'M11 8v6' } },
      { tag: 'path', attrs: { d: 'M8 11h6' } },
      { tag: 'path', attrs: { d: 'm20 20-4.2-4.2' } },
    ],
  },
  'zoom-out': {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'circle', attrs: { cx: 11, cy: 11, r: 6 } },
      { tag: 'path', attrs: { d: 'M8 11h6' } },
      { tag: 'path', attrs: { d: 'm20 20-4.2-4.2' } },
    ],
  },
  'viewport-reset': {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'polyline', attrs: { points: '8 3 3 3 3 8' } },
      { tag: 'polyline', attrs: { points: '16 3 21 3 21 8' } },
      { tag: 'polyline', attrs: { points: '21 16 21 21 16 21' } },
      { tag: 'polyline', attrs: { points: '8 21 3 21 3 16' } },
      { tag: 'rect', attrs: { x: 9, y: 9, width: 6, height: 6, rx: 1 } },
    ],
  },
  'rotate-left': {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'polyline', attrs: { points: '7 4 3 8 7 12' } },
      { tag: 'path', attrs: { d: 'M3 8h8a7 7 0 1 1-7 7' } },
    ],
  },
  'rotate-right': {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'polyline', attrs: { points: '17 4 21 8 17 12' } },
      { tag: 'path', attrs: { d: 'M21 8h-8a7 7 0 1 0 7 7' } },
    ],
  },
  'flip-horizontal': {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'path', attrs: { d: 'M12 3v18' } },
      { tag: 'path', attrs: { d: 'M10 7H5v10h5l-3-5 3-5Z' } },
      { tag: 'path', attrs: { d: 'M14 7h5v10h-5l3-5-3-5Z' } },
    ],
  },
  'flip-vertical': {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'path', attrs: { d: 'M3 12h18' } },
      { tag: 'path', attrs: { d: 'M7 10V5h10v5l-5-3-5 3Z' } },
      { tag: 'path', attrs: { d: 'M7 14v5h10v-5l-5 3-5-3Z' } },
    ],
  },
  crop: {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'path', attrs: { d: 'M6 2v14a2 2 0 0 0 2 2h14' } },
      { tag: 'path', attrs: { d: 'M18 22V8a2 2 0 0 0-2-2H2' } },
    ],
  },
  'crop-apply': {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'path', attrs: { d: 'M5 3v13a2 2 0 0 0 2 2h7' } },
      { tag: 'path', attrs: { d: 'M16 21v-9a2 2 0 0 0-2-2H3' } },
      { tag: 'path', attrs: { d: 'm14 18 2 2 5-5' } },
    ],
  },
  'crop-cancel': {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'path', attrs: { d: 'M5 3v13a2 2 0 0 0 2 2h7' } },
      { tag: 'path', attrs: { d: 'M16 21v-9a2 2 0 0 0-2-2H3' } },
      { tag: 'path', attrs: { d: 'm15 15 5 5' } },
      { tag: 'path', attrs: { d: 'm20 15-5 5' } },
    ],
  },
  text: {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'path', attrs: { d: 'M5 5h14' } },
      { tag: 'path', attrs: { d: 'M12 5v14' } },
      { tag: 'path', attrs: { d: 'M8 19h8' } },
    ],
  },
  'text-remove': {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'path', attrs: { d: 'M4 5h11' } },
      { tag: 'path', attrs: { d: 'M9.5 5v14' } },
      { tag: 'path', attrs: { d: 'M6.5 19h6' } },
      { tag: 'path', attrs: { d: 'm16 10 4 4' } },
      { tag: 'path', attrs: { d: 'm20 10-4 4' } },
    ],
  },
  download: {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'path', attrs: { d: 'M12 4v10' } },
      { tag: 'polyline', attrs: { points: '8 10 12 14 16 10' } },
      { tag: 'path', attrs: { d: 'M5 19h14' } },
    ],
  },
  'draft-save': {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'path', attrs: { d: 'M6 3h9l3 3v15H6z' } },
      { tag: 'path', attrs: { d: 'M9 3v5h6' } },
      { tag: 'path', attrs: { d: 'M12 10v7' } },
      { tag: 'polyline', attrs: { points: '9.5 14.5 12 17 14.5 14.5' } },
    ],
  },
  'draft-restore': {
    viewBox: '0 0 24 24',
    nodes: [
      { tag: 'path', attrs: { d: 'M6 3h9l3 3v15H6z' } },
      { tag: 'path', attrs: { d: 'M9 3v5h6' } },
      { tag: 'path', attrs: { d: 'M12 17v-7' } },
      { tag: 'polyline', attrs: { points: '9.5 12.5 12 10 14.5 12.5' } },
    ],
  },
} satisfies Record<IconName, IconDefinition>;

const icon = computed(() => ICONS[props.name]);
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    :viewBox="icon.viewBox"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    class="shrink-0"
  >
    <component :is="node.tag" v-for="(node, index) in icon.nodes" :key="`${props.name}-${index}`" v-bind="node.attrs" />
  </svg>
</template>
