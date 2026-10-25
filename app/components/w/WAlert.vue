<script setup lang="ts">
/**
 * 警示条：
 * - info / warn / ok：白底 + 1px 描边 + 左侧 3px 色条，一行（lead 是行首的粗体词，如「要处理」）
 * - block：阻断（不能继续）才用浅红底，带「!」图标；title 一句话说清楚，默认插槽写下一步怎么做
 * 操作（去核对、重试）放 #actions；dismissible 时右侧带关闭按钮。不写说明段落。
 */
const props = withDefaults(defineProps<{
  tone?: 'info' | 'warn' | 'ok' | 'block'
  /** 行首粗体词（条状）或标题（阻断） */
  title?: string
  dismissible?: boolean
}>(), {
  tone: 'info',
  dismissible: false,
})

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const isBlock = computed(() => props.tone === 'block')
</script>

<template>
  <div class="w-alert" :class="`w-alert--${tone}`" :role="isBlock ? 'alert' : 'status'">
    <template v-if="isBlock">
      <span class="w-alert__icon" aria-hidden="true">!</span>
      <span class="w-alert__content">
        <span v-if="title" class="w-alert__title">{{ title }}</span>
        <span v-if="$slots.default" class="w-alert__message"><slot /></span>
        <span v-if="$slots.actions" class="w-alert__actions"><slot name="actions" /></span>
      </span>
    </template>
    <template v-else>
      <span v-if="title" class="w-alert__lead">{{ title }}</span>
      <span class="w-alert__text"><slot /></span>
      <span v-if="$slots.actions" class="w-alert__actions"><slot name="actions" /></span>
    </template>
    <button v-if="dismissible" type="button" class="w-alert__close" :aria-label="t('w.alert.close')" @click="emit('close')">
      <WIcon name="close" :size="12" :stroke-width="2.4" />
    </button>
  </div>
</template>

<style scoped>
.w-alert {
  --w-alert-stripe: var(--w-info-dot);
  --w-alert-lead: var(--w-info-text);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px 8px 10px;
  border: 1px solid var(--w-border);
  border-left: 3px solid var(--w-alert-stripe);
  border-radius: var(--w-radius-control);
  background: var(--w-surface);
  color: var(--w-text-1);
  font-family: var(--w-font);
  font-size: var(--w-fs-13);
  line-height: var(--w-lh-13);
}
.w-alert--warn { --w-alert-stripe: var(--w-warn-dot); --w-alert-lead: var(--w-warn-text); }
.w-alert--ok { --w-alert-stripe: var(--w-ok-dot); --w-alert-lead: var(--w-ok-text); }
.w-alert__lead {
  flex: none;
  font-weight: var(--w-fw-semibold);
  color: var(--w-alert-lead);
}
.w-alert__text { flex: 1; min-width: 0; }
.w-alert__actions {
  display: inline-flex;
  align-items: center;
  gap: var(--w-sp-12);
  flex: none;
  font-weight: var(--w-fw-semibold);
}

.w-alert--block {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: start;
  padding: 10px 12px;
  border: 1px solid var(--w-bad-border);
  background: var(--w-bad-bg);
}
.w-alert__icon {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  border-radius: var(--w-radius-pill);
  background: var(--w-bad-dot);
  color: #FFFFFF;
  font-size: 11px;
  line-height: 1;
  font-weight: var(--w-fw-semibold);
}
.w-alert__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.w-alert__title {
  font-weight: var(--w-fw-semibold);
  color: var(--w-bad-text);
}
.w-alert__message { color: var(--w-text-2); }
.w-alert--block .w-alert__actions { margin-top: 2px; }

.w-alert__close {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  margin: -2px -4px -2px 0;
  padding: 0;
  border: 0;
  border-radius: var(--w-radius-control);
  background: transparent;
  color: var(--w-text-3);
  cursor: pointer;
}
.w-alert__close:hover { background: var(--w-surface-2); color: var(--w-text-1); }
.w-alert__close:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }
</style>
