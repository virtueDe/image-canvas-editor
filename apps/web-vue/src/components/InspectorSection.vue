<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  title: string;
  hint?: string;
  open: boolean;
  tone?: 'muted' | 'accent';
}>();

const emit = defineEmits<{
  (event: 'toggle', nextOpen: boolean): void;
}>();

const contentId = `inspector-${Math.random().toString(36).slice(2)}`;

const hintClass = computed(() => (props.tone === 'accent' ? 'inspector-section__hint--accent' : ''));
</script>

<template>
  <section :class="['inspector-section', { 'is-open': props.open, 'is-active': props.tone === 'accent' }]">
    <header class="mb-3 flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <h2 class="inspector-section__title">{{ props.title }}</h2>
        <p v-if="props.hint" class="inspector-section__hint" :class="hintClass">{{ props.hint }}</p>
      </div>
      <button
        class="inspector-section__trigger shrink-0"
        type="button"
        @click="emit('toggle', !props.open)"
        :aria-expanded="props.open"
        :aria-controls="contentId"
      >
        <span>{{ props.open ? '收起' : '展开' }}</span>
        <span class="inspector-section__chevron" aria-hidden="true">{{ props.open ? '▾' : '▸' }}</span>
      </button>
    </header>
    <div v-show="props.open" :id="contentId" class="inspector-section__body">
      <slot />
    </div>
  </section>
</template>
