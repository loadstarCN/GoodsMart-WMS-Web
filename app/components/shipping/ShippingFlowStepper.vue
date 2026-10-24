<script lang="ts" setup>
/**
 * 流程的横向进度条。默认是发货流程：下单 / 拣货 / 打包 / 发货准备 / 交承运商 / 运输中 / 签收，
 * 「发货准备」合并单证、运单、揽收三步（groupState），其余一阶段一步。窄屏时横向滚动。
 * 入库流程等传自己的 groups（阶段与所含步骤）、labelPrefix（阶段名的文案前缀）与 ariaLabel。
 */
import {
  FLOW_STAGE_GROUPS,
  groupState,
  type FlowStageGroup,
  type FlowStepBase,
  type FlowStepState,
} from '~/composables/shipping/shippingFlow'

const props = withDefaults(defineProps<{
  steps: FlowStepBase[]
  /** 阶段与所含步骤；默认发货流程的 */
  groups?: FlowStageGroup[] | null
  /** 阶段名的文案前缀（`${labelPrefix}.${group.key}`） */
  labelPrefix?: string
  ariaLabel?: string | null
}>(), {
  groups: null,
  labelPrefix: 'shipping.stages-bar',
  ariaLabel: null,
})

const { t } = useI18n()

const stages = computed(() => (props.groups || FLOW_STAGE_GROUPS).map((group: FlowStageGroup) => {
  const states = group.steps
    .map((key: string) => props.steps.find((s: FlowStepBase) => s.key === key)?.state)
    .filter((s): s is FlowStepState => !!s)
  return { key: group.key, state: states.length ? groupState(states) : 'skipped' as FlowStepState }
}))

const ICONS: Record<FlowStepState, string> = {
  done: 'ri-check-line',
  current: 'ri-arrow-right-line',
  todo: '',
  warning: 'ri-error-warning-line',
  blocked: 'ri-lock-line',
  skipped: 'ri-subtract-line',
}
</script>

<template>
  <ol class="flow-stepper" :aria-label="ariaLabel || t('shipping.title')">
    <li v-for="(stage, index) in stages" :key="stage.key" class="flow-stepper-item" :class="`is-${stage.state}`">
      <span class="flow-stepper-marker" :title="t(`shipping.states.${stage.state}`)">
        <i :class="ICONS[stage.state]" v-if="ICONS[stage.state]"></i>
        <template v-else>{{ index + 1 }}</template>
      </span>
      <span class="flow-stepper-label">{{ t(`${labelPrefix}.${stage.key}`) }}</span>
    </li>
  </ol>
</template>

<style scoped>
.flow-stepper {
  display: flex;
  list-style: none;
  margin: 0;
  padding: 0 0 0.25rem;
  overflow-x: auto;
}

.flow-stepper-item {
  position: relative;
  flex: 1 1 0;
  min-width: 5.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.375rem;
}

/* 与前一阶段的连线 */
.flow-stepper-item + .flow-stepper-item::before {
  content: '';
  position: absolute;
  top: 0.875rem;
  right: calc(50% + 1.125rem);
  left: calc(-50% + 1.125rem);
  height: 2px;
  background: var(--default-border);
}

.flow-stepper-item.is-done + .flow-stepper-item::before,
.flow-stepper-item.is-skipped + .flow-stepper-item.is-done::before {
  background: rgb(var(--success-rgb));
}

.flow-stepper-marker {
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
  z-index: 1;
}

.flow-stepper-label {
  font-size: 0.75rem;
  color: var(--text-muted, #8c9097);
  line-height: 1.2;
}

.is-done .flow-stepper-marker {
  border-color: rgb(var(--success-rgb));
  background: rgb(var(--success-rgb));
  color: #fff;
}

.is-current .flow-stepper-marker {
  border-color: rgb(var(--primary-rgb));
  background: rgb(var(--primary-rgb));
  color: #fff;
  box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.15);
}

.is-current .flow-stepper-label,
.is-warning .flow-stepper-label {
  font-weight: 600;
  color: var(--default-text-color, inherit);
}

.is-warning .flow-stepper-marker {
  border-color: rgb(var(--warning-rgb));
  background: rgb(var(--warning-rgb));
  color: #fff;
}

.is-blocked .flow-stepper-marker {
  border-style: dashed;
}

.is-skipped .flow-stepper-marker {
  border-style: dashed;
  opacity: 0.6;
}

.is-skipped .flow-stepper-label {
  opacity: 0.6;
}
</style>
