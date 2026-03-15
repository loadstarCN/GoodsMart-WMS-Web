<script lang="ts" setup>
import VueMultiselect from 'vue-multiselect'

const { t } = useI18n()

// All props/attrs are automatically passed through via inheritAttrs
// We only need to intercept 'placeholder' to provide a translated default
const attrs = useAttrs()

const mergedPlaceholder = computed(() => {
  // If a placeholder was explicitly provided, use it; otherwise use translated default
  return attrs.placeholder ?? t('common.select-placeholder')
})
</script>

<template>
  <VueMultiselect v-bind="{ ...$attrs, placeholder: mergedPlaceholder }">
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
