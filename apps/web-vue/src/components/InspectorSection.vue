<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  title: string;
  description?: string;
  startCollapsed?: boolean;
}>();

const collapsed = ref(props.startCollapsed ?? false);
const toggleCollapsed = () => {
  collapsed.value = !collapsed.value;
};
</script>

<template>
  <section class="panel p-4">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <h2 class="panel-title">{{ props.title }}</h2>
        <p v-if="props.description" class="text-xs text-slate-400">{{ props.description }}</p>
      </div>
      <button class="btn-soft px-2 py-1 text-xs" type="button" @click="toggleCollapsed">
        {{ collapsed ? '展开' : '折叠' }}
      </button>
    </div>
    <div v-show="!collapsed">
      <slot />
    </div>
  </section>
</template>
