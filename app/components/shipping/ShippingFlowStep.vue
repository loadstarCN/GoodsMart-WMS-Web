<script lang="ts" setup>
/**
 * 发货流程的一步（竖排）：左边是状态圆点，右边标题 + 实际时刻 + 来源 + 一行概要 + 操作；
 * 点标题行展开 / 收起这一步的详细内容（默认插槽）。步与步之间用竖线连起来。
 * 状态：done 已完成 / current 现在该做 / todo 还没到 / warning 要人处理 / blocked 前一步没完成 / skipped 不适用
 */
import type { FlowProblem, FlowStep } from '~/composables/shipping/shippingFlow'

const props = withDefaults(defineProps<{
  step: FlowStep
  index: number
  title: string
  summary?: string | null
  /** 有详细内容可展开 */
  expandable?: boolean
  expanded?: boolean
  /** 在标题行下面列出的问题（展开后详细内容自己会列的不传） */
  problems?: FlowProblem[]
  /** 问题的文案 */
  problemText?: (p: FlowProblem) => string
  last?: boolean
}>(), {
  summary: null,
  expandable: false,
  expanded: false,
  problems: () => [],
  problemText: (p: FlowProblem) => p.message || p.code,
  last: false,
})

const emit = defineEmits<{
  (e: 'toggle'): void
}>()

const { t, te, localeProperties } = useI18n()

const timeText = computed(() => formatLocaleDateTime(props.step.at, String(localeProperties.value?.iso || '') || undefined))
const sourceText = computed(() => {
  const s = props.step.source
  if (!s) return ''
  // api：下单一步是来源系统；运单 / 揽收一步是经承运商插件（在线对接）建的 / 约的
  const key = s === 'api' && (props.step.key === 'waybill' || props.step.key === 'pickup')
    ? 'shipping.sources.carrier-api'
    : `shipping.sources.${s}`
  return te(key) ? t(key) : s
})
const SOURCE_CLASSES: Record<string, string> = {
  warehouse: 'bg-primary-transparent',
  carrier: 'bg-info-transparent',
  rule: 'bg-warning-transparent',
  api: 'bg-secondary-transparent',
  system: 'bg-light text-default',
}
const sourceClass = computed(() => SOURCE_CLASSES[String(props.step.source || '')] || 'bg-light text-default')
const toggle = () => {
  if (props.expandable) emit('toggle')
}
</script>

<template>
  <section class="flow-step" :class="[`is-${step.state}`, { 'is-last': last, 'is-expanded': expanded }]"
    :id="`shipping-step-${step.key}`">
    <div class="flow-step-rail" aria-hidden="true">
      <span class="flow-step-marker">
        <i class="ri-check-line" v-if="step.state === 'done'"></i>
        <i class="ri-error-warning-line" v-else-if="step.state === 'warning'"></i>
        <i class="ri-lock-line" v-else-if="step.state === 'blocked'"></i>
        <i class="ri-subtract-line" v-else-if="step.state === 'skipped'"></i>
        <template v-else>{{ index }}</template>
      </span>
    </div>
    <div class="flow-step-main">
      <div class="flow-step-head">
        <div class="flow-step-title" :class="{ 'is-clickable': expandable }" :role="expandable ? 'button' : undefined"
          :tabindex="expandable ? 0 : undefined" :aria-expanded="expandable ? expanded : undefined"
          @click="toggle" @keydown.enter.prevent="toggle" @keydown.space.prevent="toggle">
          <span class="fw-semibold">{{ title }}</span>
          <span class="badge" :class="sourceClass" v-if="sourceText && step.state !== 'skipped'">{{ sourceText }}</span>
          <span class="flow-step-time" v-if="timeText" :title="step.at || ''">
            <i class="ri-time-line me-1"></i>{{ timeText }}
          </span>
          <slot name="tag" />
          <i class="flow-step-chevron" :class="expanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'" v-if="expandable"></i>
        </div>
        <div class="flow-step-actions" v-if="$slots.actions">
          <slot name="actions" />
        </div>
      </div>
      <div class="flow-step-summary" v-if="summary">{{ summary }}</div>
      <div class="flow-step-meta" v-if="$slots.meta">
        <slot name="meta" />
      </div>
      <ul class="flow-step-problems" v-if="problems.length">
        <li v-for="(p, i) in problems" :key="`${p.code}-${i}`" :class="p.level === 'error' ? 'text-danger' : 'text-warning'">
          <i class="me-1" :class="p.level === 'error' ? 'ri-close-circle-line' : 'ri-error-warning-line'"></i>{{ problemText(p) }}
        </li>
      </ul>
      <div class="flow-step-body" v-if="$slots.default" v-show="expanded">
        <slot />
      </div>
    </div>
  </section>
</template>

<style scoped>
.flow-step {
  display: flex;
  gap: 0.875rem;
}

.flow-step-rail {
  position: relative;
  flex: 0 0 1.75rem;
  display: flex;
  justify-content: center;
}

.flow-step-rail::after {
  content: '';
  position: absolute;
  top: 2rem;
  bottom: 0.25rem;
  left: 50%;
  width: 1px;
  background: var(--default-border);
}

.flow-step.is-last .flow-step-rail::after {
  display: none;
}

.flow-step-marker {
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

.is-current .flow-step-marker {
  border-color: rgb(var(--primary-rgb));
  color: rgb(var(--primary-rgb));
  box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.12);
}

.is-done .flow-step-marker {
  border-color: rgb(var(--success-rgb));
  background: rgb(var(--success-rgb));
  color: #fff;
}

.is-warning .flow-step-marker {
  border-color: rgb(var(--warning-rgb));
  background: rgb(var(--warning-rgb));
  color: #fff;
}

.is-blocked .flow-step-marker,
.is-skipped .flow-step-marker {
  border-style: dashed;
}

.flow-step-main {
  flex: 1 1 auto;
  min-width: 0;
  padding-bottom: 1.125rem;
}

.flow-step.is-last .flow-step-main {
  padding-bottom: 0;
}

.flow-step-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 1.75rem;
}

.flow-step-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.flow-step-title.is-clickable {
  cursor: pointer;
}

.flow-step-title.is-clickable:focus-visible {
  outline: 2px solid rgba(var(--primary-rgb), 0.4);
  outline-offset: 2px;
  border-radius: 0.25rem;
}

.flow-step-time {
  font-size: 0.75rem;
  color: var(--text-muted, #8c9097);
}

.flow-step-chevron {
  color: var(--text-muted, #8c9097);
}

.flow-step-summary {
  font-size: 0.8125rem;
  color: var(--text-muted, #8c9097);
  margin-top: 0.125rem;
  word-break: break-word;
}

.is-warning .flow-step-summary {
  color: rgb(var(--warning-rgb));
}

.is-todo .flow-step-title > .fw-semibold,
.is-blocked .flow-step-title > .fw-semibold,
.is-skipped .flow-step-title > .fw-semibold {
  color: var(--text-muted, #8c9097);
}

.is-skipped .flow-step-summary {
  opacity: 0.75;
}

.flow-step-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
  font-size: 0.75rem;
  margin-top: 0.125rem;
}

.flow-step-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}

.flow-step-problems {
  list-style: none;
  padding: 0;
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
}

.flow-step-body {
  margin-top: 0.625rem;
}
</style>
