<script lang="ts" setup>
import VueMultiselect from 'vue-multiselect'

const { t } = useI18n()

// All props/attrs are automatically passed through via inheritAttrs
// We only need to intercept 'placeholder' to provide a translated default
const attrs = useAttrs()

const mergedPlaceholder = computed(() => {
  // If a placeholder was explicitly provided, use it; otherwise use translated default
  return (attrs.placeholder as string | undefined) ?? t('common.select-placeholder')
})
</script>

<template>
  <!-- 透传给 vue-multiselect 的 attrs 类型是 unknown，必填的 options 由使用方传 -->
  <VueMultiselect v-bind="({ ...$attrs, placeholder: mergedPlaceholder } as any)">
    <template v-for="(_, name) in $slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData || {}" />
    </template>
  </VueMultiselect>
</template>

<script lang="ts">
export default {
  inheritAttrs: false,
}
</script>
