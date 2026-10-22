<script lang="ts" setup>
/**
 * 海外发货区的一步（箱子 / 运单 / 单证 / 发货）：左边是序号或状态圆点，右边标题 + 一行概要 + 操作，
 * 下面是这一步的内容。步与步之间用竖线连起来。
 * state：done 已完成 / current 现在该做 / todo 还没到 / warning 有问题要处理
 */
withDefaults(defineProps<{
  index: number
  title: string
  state?: 'done' | 'current' | 'todo' | 'warning'
  summary?: string | null
  /** 最后一步：不画往下的连线 */
  last?: boolean
}>(), {
  state: 'todo',
  summary: null,
  last: false,
})
</script>

<template>
  <section class="shipping-step" :class="[`is-${state}`, { 'is-last': last }]">
    <div class="shipping-step-rail" aria-hidden="true">
      <span class="shipping-step-marker">
        <i class="ri-check-line" v-if="state === 'done'"></i>
        <template v-else-if="state === 'warning'">!</template>
        <template v-else>{{ index }}</template>
      </span>
    </div>
    <div class="shipping-step-main">
      <div class="shipping-step-head">
        <div class="shipping-step-title">
          <span class="fw-semibold">{{ title }}</span>
          <slot name="tag" />
          <span class="shipping-step-summary" v-if="summary">{{ summary }}</span>
        </div>
        <div class="shipping-step-actions" v-if="$slots.actions">
          <slot name="actions" />
        </div>
      </div>
      <div class="shipping-step-body" v-if="$slots.default">
        <slot />
      </div>
    </div>
  </section>
</template>

<style scoped>
.shipping-step {
  display: flex;
  gap: 0.875rem;
}

.shipping-step-rail {
  position: relative;
  flex: 0 0 1.75rem;
  display: flex;
  justify-content: center;
}

.shipping-step-rail::after {
  content: '';
  position: absolute;
  top: 2rem;
  bottom: 0.25rem;
  left: 50%;
  width: 1px;
  background: var(--default-border);
}

.shipping-step.is-last .shipping-step-rail::after {
  display: none;
}

.shipping-step-marker {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8125rem;
  font-weight: 600;
  border: 1px solid var(--default-border);
  color: var(--text-muted, #8c9097);
  background: var(--custom-white, #fff);
}

.is-current .shipping-step-marker {
  border-color: rgb(var(--primary-rgb));
  color: rgb(var(--primary-rgb));
  box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.12);
}

.is-done .shipping-step-marker {
  border-color: rgb(var(--success-rgb));
  background: rgb(var(--success-rgb));
  color: #fff;
}

.is-warning .shipping-step-marker {
  border-color: rgb(var(--warning-rgb));
  background: rgb(var(--warning-rgb));
  color: #fff;
}

.shipping-step-main {
  flex: 1 1 auto;
  min-width: 0;
  padding-bottom: 1.25rem;
}

.shipping-step.is-last .shipping-step-main {
  padding-bottom: 0;
}

.shipping-step-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 1.75rem;
}

.shipping-step-title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
}

.shipping-step-summary {
  font-size: 0.8125rem;
  color: var(--text-muted, #8c9097);
}

.is-warning .shipping-step-summary {
  color: rgb(var(--warning-rgb));
}

.is-todo .shipping-step-title > .fw-semibold {
  color: var(--text-muted, #8c9097);
}

.shipping-step-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}

.shipping-step-body {
  margin-top: 0.625rem;
}
</style>
