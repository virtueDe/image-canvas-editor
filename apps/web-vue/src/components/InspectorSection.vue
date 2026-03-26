<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  title: string;
  hint?: string;
  open: boolean;
  tone?: 'muted' | 'accent';
}>();

const emit = defineEmits<{
  (event: 'toggle'): void;
}>();

const hintClass = computed(() => (props.tone === 'accent' ? 'text-cyan-300' : 'text-slate-400'));
</script>

<template>
  <section class="panel p-4">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <h2 class="panel-title">{{ props.title }}</h2>
        <p v-if="props.hint" class="text-xs" :class="hintClass">{{ props.hint }}</p>
      </div>
      <button class="btn-soft px-2 py-1 text-xs" type="button" @click="emit('toggle')">
        {{ props.open ? '折叠' : '展开' }}
      </button>
    </div>
    <div v-show="props.open">
      <slot />
    </div>
  </section>
</template>
