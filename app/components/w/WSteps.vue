<script setup lang="ts">
/**
 * 流程进度（发货单 / 收货通知的进度条）：
 * 完成 = 20px 实心绿勾；当前 = 紫色描边圈；需处理 = 琥珀「!」；未开始 = 灰圈加序号。
 * 连线：走过的段中性深灰（#A0A4B0），没走的浅灰；不再一路绿。每步下面是步骤名 13 和时刻 12（可选）。
 * 读屏：每步读出「步骤名，状态」，当前步带 aria-current="step"。
 */
export type WStepState = 'done' | 'current' | 'warn' | 'todo'

export interface WStepItem {
  key: string
  label: string
  state: WStepState
  /** 步骤下面的小字：时刻、预计时间 */
  time?: string
}

const props = defineProps<{
  steps: WStepItem[]
  /** 这组控件的无障碍名称（aria-label） */
  label: string
}>()

const { t } = useI18n()
/** 到过（不是未开始）的步骤：连线走到这里画深灰 */
const reached = (index: number) => {
  const step = props.steps[index]
  return !!step && step.state !== 'todo'
}
/** 读屏读的状态（带括号，接在步骤名后面） */
const stateText = (state: WStepState) => t('w.steps.sr-state', { state: t(`w.steps.${state}`) })
</script>

<template>
  <ol class="w-steps" :aria-label="label">
    <li v-for="(step, index) in steps" :key="step.key" class="w-steps__item" :class="`is-${step.state}`"
      :aria-current="step.state === 'current' || step.state === 'warn' ? 'step' : undefined">
      <div class="w-steps__track" aria-hidden="true">
        <span class="w-steps__line" :class="{ 'is-hidden': index === 0, 'is-reached': reached(index) }" />
        <span class="w-steps__node">
          <WIcon v-if="step.state === 'done'" name="check" :size="12" :stroke-width="3.2" />
          <template v-else-if="step.state === 'warn'">!</template>
          <template v-else-if="step.state === 'todo'">{{ index + 1 }}</template>
        </span>
        <span class="w-steps__line" :class="{ 'is-hidden': index === steps.length - 1, 'is-reached': reached(index + 1) }" />
      </div>
      <span class="w-steps__label">{{ step.label }}<span class="w-sr-only">{{ stateText(step.state) }}</span></span>
      <span v-if="step.time" class="w-steps__time">{{ step.time }}</span>
    </li>
  </ol>
</template>

<style scoped>
.w-steps {
  display: flex;
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--w-font);
}
.w-steps__item {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.w-steps__track {
  display: flex;
  align-items: center;
  width: 100%;
  height: 28px;
}
.w-steps__line {
  flex: 1;
  height: 2px;
  background: var(--w-line);
}
.w-steps__line.is-reached { background: var(--w-nontext); }
.w-steps__line.is-hidden { visibility: hidden; }
.w-steps__node {
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
.is-done .w-steps__node { background: var(--w-ok-dot); color: #FFFFFF; }
.is-current .w-steps__node {
  border: 3px solid var(--w-sel);
  background: var(--w-surface);
}
.is-warn .w-steps__node {
  width: 24px;
  height: 24px;
  background: var(--w-warn-dot);
  color: var(--w-neutral-900);
  font-size: 14px;
  box-shadow: 0 0 0 4px var(--w-warn-bg);
}
.is-todo .w-steps__node {
  border: 1.5px solid var(--w-border-strong);
  background: var(--w-surface);
  color: var(--w-text-3);
}
.w-steps__label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
  color: var(--w-text-1);
}
.is-current .w-steps__label { font-weight: var(--w-fw-semibold); }
.is-warn .w-steps__label { font-weight: var(--w-fw-semibold); color: var(--w-warn-text); }
.is-todo .w-steps__label { color: var(--w-text-3); }
.w-steps__time {
  font-size: var(--w-fs-12);
  line-height: 16px;
  color: var(--w-text-3);
  white-space: nowrap;
}
</style>
