<script lang="ts" setup>
/**
 * 发货单详情顶部的进度卡（设计稿 Main：仓内作业 / 发货准备 / 交接与运输三段，每段三步）：
 * - 段名 + 段状态（● 已完成 / 要处理 / 进行中 / 未开始）；节点：完成小号绿勾、当前紫圈、要处理琥珀「!」、没到灰圈序号、
 *   不适用虚线圈；节点下面是步骤名和实际时刻（签收没到时写预计送达）
 * - 点节点：下面的步骤卡换成这一步（emit select），当前看的那步标出
 * - 「要处理 N」条：流程的问题（这一步的名字 + 问题），「去处理」切到那一步
 * 数据来自页面提供的 useShippingFlowView（SHIPPING_FLOW_VIEW）。
 */
import { SHIPPING_FLOW_VIEW } from '~/composables/shipping/useShippingFlowView'
import { FLOW_PHASES, nodeState, phaseState } from '~/utils/dnFlowDisplay'
import type { FlowProblem, FlowStep } from '~/composables/shipping/shippingFlow'

const props = defineProps<{
  /** 步骤卡现在显示的步 */
  selected: string | null
}>()
const emit = defineEmits<{ select: [key: string] }>()

const { t } = useI18n()
const view = inject(SHIPPING_FLOW_VIEW)!
const { format } = useTimeZone()

const stepMap = computed(() => new Map((view.flow.value?.steps || []).map((s: FlowStep) => [s.key as string, s])))
let counter = 0
const phases = computed(() => {
  counter = 0
  return FLOW_PHASES.map((phase) => {
    const steps = phase.steps.map((key) => stepMap.value.get(key)).filter((s): s is FlowStep => !!s)
    const state = phaseState(steps.map((s) => s.state))
    return {
      key: phase.key,
      state,
      steps: steps.map((step) => ({ step, no: ++counter, node: nodeState(step.state), time: timeOf(step) })),
    }
  })
})
const PHASE_TONES: Record<string, 'ok' | 'warn' | 'info' | 'none'> = { done: 'ok', warn: 'warn', current: 'info', todo: 'none', skipped: 'none' }

/** 节点下面的小字：发生时刻；签收没到时写预计送达 */
const timeOf = (step: FlowStep): string => {
  if (step.at) return format(step.at, 'MM/DD HH:mm', { withZone: false })
  if (step.key === 'delivered' && step.state !== 'skipped') {
    const transit = stepMap.value.get('transit')
    const eta = String(step.summary?.estimated_delivery || transit?.summary?.tracking?.estimated_delivery || '')
    if (eta) return t('dn.detail.eta-short', { date: eta.length >= 10 ? `${eta.slice(5, 7)}/${eta.slice(8, 10)}` : eta })
  }
  return ''
}

const problems = computed<FlowProblem[]>(() => view.flow.value?.problems || [])
const problemStep = (p: FlowProblem) => (p.step && stepMap.value.has(String(p.step)) ? String(p.step) : null)
</script>

<template>
  <section class="w-dnprog" :aria-label="t('shipping.title')">
    <div class="w-dnprog__phases">
      <div v-for="phase in phases" :key="phase.key" class="w-dnprog__phase">
        <div class="w-dnprog__phase-head">
          <span class="w-dnprog__phase-name">{{ t(`dn.detail.phases.${phase.key}`) }}</span>
          <WStatus :tone="PHASE_TONES[phase.state] || 'none'" :variant="phase.state === 'warn' ? 'text' : 'dot'" muted>
            {{ t(`dn.detail.phase-states.${phase.state}`) }}
          </WStatus>
        </div>
        <ol class="w-dnprog__steps">
          <li v-for="(item, i) in phase.steps" :key="item.step.key" class="w-dnprog__step" :class="[`is-${item.node}`, { 'is-selected': selected === item.step.key }]">
            <button type="button" class="w-dnprog__btn" :aria-current="selected === item.step.key ? 'step' : undefined"
              @click="emit('select', item.step.key)">
              <span class="w-dnprog__track" aria-hidden="true">
                <span class="w-dnprog__line" :class="{ 'is-hidden': i === 0, 'is-reached': item.node !== 'todo' && item.node !== 'skip' }" />
                <span class="w-dnprog__node">
                  <WIcon v-if="item.node === 'done'" name="check" :size="12" :stroke-width="3.2" />
                  <template v-else-if="item.node === 'warn'">!</template>
                  <template v-else-if="item.node === 'todo'">{{ item.no }}</template>
                  <template v-else-if="item.node === 'skip'">–</template>
                </span>
                <span class="w-dnprog__line" :class="{ 'is-hidden': i === phase.steps.length - 1,
                  'is-reached': ['done', 'current', 'warn'].includes(phase.steps[i + 1]?.node || '') }" />
              </span>
              <span class="w-dnprog__label">{{ view.stepTitle(item.step.key) }}<span class="w-sr-only">（{{ t(`shipping.states.${item.step.state}`) }}）</span></span>
              <span class="w-dnprog__time">{{ item.time }}</span>
            </button>
          </li>
        </ol>
      </div>
    </div>

    <!-- 要处理：流程的问题 -->
    <div v-if="problems.length" class="w-dnprog__problems" role="status">
      <span class="w-dnprog__problems-title">{{ t('dn.detail.problems', { count: problems.length }) }}</span>
      <ul class="w-dnprog__problem-list">
        <li v-for="(p, i) in problems" :key="`${p.code}-${i}`" class="w-dnprog__problem">
          <b v-if="problemStep(p)">{{ view.stepTitle(problemStep(p)!) }}</b>
          <span>{{ view.problemText(p) }}</span>
          <button v-if="problemStep(p) && problemStep(p) !== selected" type="button" class="w-dnprog__go" @click="emit('select', problemStep(p)!)">
            {{ t('dn.detail.go-handle') }}
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.w-dnprog {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px var(--w-card-pad);
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
  background: var(--w-surface);
  font-family: var(--w-font);
}
.w-dnprog__phases { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; }
.w-dnprog__phase { min-width: 0; padding: 0 12px; }
.w-dnprog__phase + .w-dnprog__phase { border-left: 1px solid var(--w-line); }
.w-dnprog__phase:first-child { padding-left: 0; }
.w-dnprog__phase:last-child { padding-right: 0; }
.w-dnprog__phase-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
}
.w-dnprog__phase-name { color: var(--w-text-2); font-weight: var(--w-fw-medium); }
.w-dnprog__steps { display: flex; margin: 0; padding: 0; list-style: none; }
.w-dnprog__step { flex: 1 1 0; min-width: 0; }
.w-dnprog__btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 0 0 4px;
  border: 0;
  border-radius: var(--w-radius-control);
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.w-dnprog__btn:hover .w-dnprog__label { color: var(--w-link); }
.w-dnprog__btn:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }
.w-dnprog__track { display: flex; align-items: center; width: 100%; height: 28px; }
.w-dnprog__line { flex: 1; height: 2px; background: var(--w-line); }
.w-dnprog__line.is-reached { background: var(--w-nontext); }
.w-dnprog__line.is-hidden { visibility: hidden; }
.w-dnprog__node {
  display: grid;
  place-items: center;
  flex: none;
  width: 20px;
  height: 20px;
  box-sizing: border-box;
  border-radius: var(--w-radius-pill);
  font-size: 11px;
  line-height: 1;
  font-weight: var(--w-fw-semibold);
}
.is-done .w-dnprog__node { background: var(--w-ok-dot); color: #FFFFFF; }
.is-current .w-dnprog__node { border: 3px solid var(--w-sel); background: var(--w-surface); }
.is-warn .w-dnprog__node {
  width: 24px;
  height: 24px;
  background: var(--w-warn-dot);
  color: var(--w-neutral-900);
  font-size: 14px;
  box-shadow: 0 0 0 4px var(--w-warn-bg);
}
.is-todo .w-dnprog__node { border: 1.5px solid var(--w-border-strong); background: var(--w-surface); color: var(--w-text-3); }
.is-skip .w-dnprog__node { border: 1.5px dashed var(--w-border-strong); background: var(--w-surface); color: var(--w-text-3); }
.w-dnprog__label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-1);
}
.is-current .w-dnprog__label { font-weight: var(--w-fw-semibold); }
.is-warn .w-dnprog__label { font-weight: var(--w-fw-semibold); color: var(--w-warn-text); }
.is-todo .w-dnprog__label, .is-skip .w-dnprog__label { color: var(--w-text-3); }
.is-selected .w-dnprog__label { color: var(--w-sel-text); text-decoration: underline; text-decoration-color: var(--w-sel-line); text-underline-offset: 4px; }
.w-dnprog__time {
  min-height: 16px;
  font-size: var(--w-fs-12);
  line-height: 16px;
  color: var(--w-text-3);
  white-space: nowrap;
}

/* 要处理：白底 + 左侧琥珀条 */
.w-dnprog__problems {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--w-border);
  border-left: 3px solid var(--w-warn-dot);
  border-radius: var(--w-radius-control);
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
}
.w-dnprog__problems-title { flex: none; font-weight: var(--w-fw-semibold); color: var(--w-warn-text); }
.w-dnprog__problem-list { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; min-width: 0; }
.w-dnprog__problem { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; color: var(--w-text-2); }
.w-dnprog__problem b { color: var(--w-text-1); font-weight: var(--w-fw-semibold); }
.w-dnprog__go {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--w-link);
  font: inherit;
  font-weight: var(--w-fw-semibold);
  cursor: pointer;
}
.w-dnprog__go:hover { color: var(--w-link-hover); }
@media (max-width: 1199.98px) {
  .w-dnprog__phases { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .w-dnprog__phase { padding: 0; }
  .w-dnprog__phase + .w-dnprog__phase { border-left: 0; border-top: 1px solid var(--w-line); padding-top: 12px; }
}
</style>
