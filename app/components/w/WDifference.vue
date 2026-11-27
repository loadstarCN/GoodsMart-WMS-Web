<script setup lang="ts">
const props = withDefaults(defineProps<{
  value: number | string | null | undefined
  signed?: boolean
  text?: string
}>(), { signed: true })

const { locale } = useI18n()
const number = computed(() => {
  if (props.value == null || (typeof props.value === 'string' && !props.value.trim())) return null
  const value = Number(props.value)
  return Number.isFinite(value) ? value : null
})
const display = computed(() => props.text ?? (number.value === null ? '—' : new Intl.NumberFormat(locale.value, {
  signDisplay: props.signed ? 'exceptZero' : 'auto',
  maximumFractionDigits: 20,
}).format(number.value)))
</script>

<template>
  <span class="w-difference" :class="{ 'w-difference--nonzero': number !== null && number !== 0 }">{{ display }}</span>
</template>

<style scoped>
.w-difference { display: inline-block; font-variant-numeric: tabular-nums; white-space: nowrap; }
.w-difference--nonzero {
  padding: 1px 6px;
  border: 1px solid var(--w-warn-border);
  border-radius: 5px;
  background: var(--w-warn-bg);
  color: var(--w-warn-text);
  font-weight: 650;
}
</style>
