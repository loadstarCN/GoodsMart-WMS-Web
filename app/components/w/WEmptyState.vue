<script setup lang="ts">
/**
 * 空状态：一个图标 + 一句标题 + 一个操作，不写说明段落（需要解释时标题旁放 WHelp）。
 * 操作用 #action 插槽（通常一个主按钮），或给 actionLabel 由组件出一个主按钮（点击发 action）。
 * compact：放在表格里时上下留白小一些。
 */
import type { WIconName } from '~/utils/icons'

withDefaults(defineProps<{
  title: string
  icon?: WIconName
  actionLabel?: string
  compact?: boolean
}>(), {
  icon: 'box',
  compact: false,
})

const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <div class="w-empty" :class="{ 'is-compact': compact }">
    <span class="w-empty__icon" aria-hidden="true"><WIcon :name="icon" :size="20" :stroke-width="1.7" /></span>
    <p class="w-empty__title"><slot name="title">{{ title }}</slot></p>
    <div v-if="$slots.action || actionLabel" class="w-empty__action">
      <slot name="action">
        <WButton variant="primary" size="sm" @click="emit('action')">{{ actionLabel }}</WButton>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.w-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--w-sp-8);
  padding: var(--w-sp-48) var(--w-sp-16);
  text-align: center;
  font-family: var(--w-font);
}
.w-empty.is-compact { padding: var(--w-sp-32) var(--w-sp-16); }
.w-empty__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--w-radius-card);
  background: var(--w-surface-2);
  color: var(--w-text-3);
}
.w-empty__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: var(--w-fs-16);
  line-height: var(--w-lh-16);
  font-weight: var(--w-fw-semibold);
  color: var(--w-text-1);
}
.w-empty__action { margin-top: var(--w-sp-4); }
/* 设计稿：空状态里的按钮高 32、13px */
.w-empty__action :deep(.w-btn--sm) { height: 32px; padding: 0 14px; }
</style>
