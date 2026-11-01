<script setup lang="ts">
defineOptions({inheritAttrs:false})
defineProps<{disabled?:boolean}>()
const model=defineModel<string>()
const visible=ref(false),{t}=useI18n()
</script>
<template><WInput v-bind="$attrs" v-model="model" :type="visible?'text':'password'" :disabled="disabled"><template #suffix><button type="button" :disabled="disabled" :aria-label="t(visible?'auth-design.hide-password':'auth-design.show-password')" :aria-pressed="visible" @click="visible=!visible"><WIcon :name="visible?'eye-off':'eye'" :size="18"/></button></template></WInput></template>
<style scoped>button{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:6px;background:transparent;color:var(--w-text-3);cursor:pointer}button:focus-visible{outline:2px solid var(--w-pri);outline-offset:1px}button:disabled{cursor:default;opacity:.5}</style>
