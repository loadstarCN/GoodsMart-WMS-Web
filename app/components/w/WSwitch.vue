<script setup lang="ts">
/**
 * 开关：立即生效的二值设置（如「使用平面图」）。role="switch" + aria-checked；
 * 文字放 label 或默认插槽，点文字也能切换。需要「保存」后才生效的选项用 WCheckbox。
 */
const props = withDefaults(defineProps<{
  label?: string
  disabled?: boolean
  id?: string
}>(), {
  disabled: false,
})

const model = defineModel<boolean>({ default: false })
const field = useWField()
const uid = useId()
const switchId = computed(() => props.id || field?.id.value || `${uid}-switch`)
const labelId = `${uid}-label`

const toggle = () => {
  if (!props.disabled) model.value = !model.value
}
</script>

<template>
  <span class="w-switch" :class="{ 'is-disabled': disabled }">
    <button :id="switchId" type="button" role="switch" class="w-switch__track" :class="{ 'is-on': model }"
      :aria-checked="model" :aria-labelledby="label || $slots.default ? labelId : undefined"
      :aria-describedby="field?.describedBy.value" :disabled="disabled" @click="toggle">
      <span class="w-switch__thumb" aria-hidden="true" />
    </button>
    <span v-if="label || $slots.default" :id="labelId" class="w-switch__label" @click="toggle"><slot>{{ label }}</slot></span>
  </span>
</template>

<style scoped>
.w-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--w-font);
  font-size: var(--w-fs-14);
  line-height: 20px;
  color: var(--w-text-1);
}
.w-switch__track {
  display: flex;
  justify-content: flex-start;
  flex: none;
  width: 36px;
  height: 20px;
  padding: 2px;
  border: 0;
  border-radius: var(--w-radius-pill);
  background: var(--w-border-strong);
  cursor: pointer;
  transition: background-color 0.15s;
}
.w-switch__track.is-on { background: var(--w-pri); }
.w-switch__thumb {
  width: 16px;
  height: 16px;
  border-radius: var(--w-radius-pill);
  background: #FFFFFF;
  box-shadow: var(--w-shadow-thumb);
  transition: transform 0.15s;
}
.w-switch__track.is-on .w-switch__thumb { transform: translateX(16px); }
.w-switch__track:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }
.w-switch__label { cursor: pointer; user-select: none; }
.w-switch.is-disabled { color: var(--w-text-3); }
.w-switch.is-disabled .w-switch__track,
.w-switch.is-disabled .w-switch__label { cursor: not-allowed; opacity: 0.6; }
@media (prefers-reduced-motion: reduce) {
  .w-switch__track, .w-switch__thumb { transition: none; }
}
</style>
