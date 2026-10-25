<script setup lang="ts">
/**
 * 密码 / 密钥输入框：默认按 password 遮住，带「显示 / 隐藏」切换。
 * - v-model：输入值；v-model:visible：是否明文显示（如「生成密码」后让操作人看到生成的值）
 * - append 插槽：放在切换按钮后面的按钮（如「生成」）
 */
const props = withDefaults(defineProps<{
  id?: string
  placeholder?: string
  autocomplete?: string
  invalid?: boolean
  maxlength?: number
}>(), {
  autocomplete: 'new-password',
})

const model = defineModel<string | null>()
const visible = defineModel<boolean>('visible', { default: false })

const { t } = useI18n()
const toggleLabel = computed(() => (visible.value ? t('common.hide-secret') : t('common.show-secret')))
</script>

<template>
  <div class="input-group">
    <input v-model="model" :type="visible ? 'text' : 'password'" class="form-control" :class="{ 'is-invalid': props.invalid }"
      :id="props.id" :placeholder="props.placeholder" :autocomplete="props.autocomplete" :maxlength="props.maxlength"
      spellcheck="false" autocapitalize="off">
    <button class="btn btn-light" type="button" :title="toggleLabel" :aria-label="toggleLabel" :aria-pressed="visible"
      @click="visible = !visible">
      <i class="align-middle" :class="visible ? 'ri-eye-line' : 'ri-eye-off-line'"></i>
    </button>
    <slot name="append" />
  </div>
</template>
