<script setup lang="ts">
import type { InboundFlow } from '~/composables/asn/inboundFlow'
import { activeStepKey } from '~/composables/shipping/shippingFlow'
const props = defineProps<{ flow: InboundFlow; selected: string | null }>()
const emit = defineEmits<{ select: [key: string] }>()
const { t } = useI18n()
const { format } = useTimeZone(() => props.flow.timezone || props.flow.warehouse_id)
const active = computed(() => activeStepKey(props.flow.steps))
const reached = (index: number) => ['done', 'current', 'warning'].includes(props.flow.steps[index]?.state || '')
</script>
<template>
  <section class="asn-progress" :aria-label="t('asn.flow.title')">
    <ol>
      <li v-for="(step, index) in flow.steps" :key="step.key">
        <button type="button" :class="[step.state, { inspected: selected && selected === step.key && selected !== active }]"
          :aria-current="step.key === active ? 'step' : undefined" @click="emit('select', step.key)">
          <span class="asn-progress__track" aria-hidden="true">
            <span class="asn-progress__line" :class="{ hidden: index === 0, reached: reached(index) }" />
            <span class="asn-progress__node">
              <WIcon v-if="step.state === 'done'" name="check" :size="12" :stroke-width="3.2" />
              <span v-else-if="step.state === 'current'" class="asn-progress__dot" />
              <span v-else-if="step.state === 'warning'">!</span>
              <span v-else-if="step.state === 'skipped'">–</span>
              <span v-else>{{ index + 1 }}</span>
            </span>
            <span class="asn-progress__line" :class="{ hidden: index === flow.steps.length - 1, reached: reached(index + 1) }" />
          </span>
          <span class="asn-progress__label">{{ t(`asn.flow.steps.${step.key}`) }}</span>
          <span class="asn-progress__time">{{ step.at ? format(step.at, 'MM/DD HH:mm', { withZone: false }) : t(`shipping.states.${step.state}`) }}</span>
        </button>
      </li>
    </ol>
  </section>
</template>
<style scoped>
.asn-progress { padding: 16px 24px 20px; border: 1px solid var(--w-border); border-radius: 10px; background: var(--w-surface); overflow-x: auto; }
.asn-progress ol { display: flex; list-style: none; margin: 0; padding: 0; min-width: 540px; }
.asn-progress li { flex: 1 1 0; min-width: 0; }
.asn-progress button { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; margin: 0; padding: 0; border: 0; background: transparent; font: inherit; cursor: pointer; }
.asn-progress button:focus-visible { outline: 2px solid var(--w-focus); outline-offset: 4px; border-radius: 6px; }
.asn-progress__track { display: flex; align-items: center; width: 100%; height: 28px; }
.asn-progress__line { flex: 1; height: 2px; background: var(--w-line); }
.asn-progress__line.reached { background: var(--w-nontext); }
.asn-progress__line.hidden { visibility: hidden; }
.asn-progress__node { display: grid; place-items: center; flex: none; width: 20px; height: 20px; border: 1.5px solid var(--w-border-strong); border-radius: 999px; box-sizing: border-box; background: var(--w-surface); color: var(--w-text-3); font-size: 12px; line-height: 1; font-weight: 600; }
.done .asn-progress__node { border: 0; background: var(--w-ok-dot); color: white; }
.current .asn-progress__node { border: 0; background: var(--w-pri); box-shadow: 0 0 0 4px var(--w-focus); }
.warning .asn-progress__node { border: 0; background: var(--w-warn-dot); box-shadow: 0 0 0 4px var(--w-warn-bg); color: var(--w-neutral-900); }
.skipped .asn-progress__node { border-style: dashed; }
.asn-progress__dot { width: 6px; height: 6px; background: white; border-radius: 999px; }
.asn-progress__label { font-size: 13px; line-height: 20px; font-weight: 400; color: var(--w-text-1); white-space: nowrap; }
.current .asn-progress__label { color: var(--w-sel-text); font-weight: 600; }
.warning .asn-progress__label { color: var(--w-warn-text); font-weight: 600; }
.todo .asn-progress__label, .blocked .asn-progress__label, .skipped .asn-progress__label { color: var(--w-text-3); }
.inspected .asn-progress__label { text-decoration: underline; text-underline-offset: 4px; }
.asn-progress__time { font-size: 12px; line-height: 16px; font-weight: 400; color: var(--w-text-3); white-space: nowrap; min-height: 16px; }
</style>
