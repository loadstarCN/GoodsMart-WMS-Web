<script setup lang="ts">
/**
 * 弹窗：确认、短表单。v-model:open 控制开关；标题 16 / 600，正文 14 次要文字，按钮放 #footer（右对齐，
 * 主操作在最右；危险确认用 WButton variant="danger-confirm"，取消用次按钮写明「先不取消」一类的话）。
 * 打开时焦点移进弹窗、Tab 不出弹窗、Esc 关闭、背景不滚动；关闭后焦点回到打开它的按钮。
 * 内容很长、需要边看列表边填的用 WDrawer。
 */
const props = withDefaults(defineProps<{
  title: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** 右上角关闭按钮、Esc、点遮罩是否能关闭（提交中可临时关掉） */
  closable?: boolean
  closeOnBackdrop?: boolean
  /** 盖在其它弹窗上面（确认框：从弹窗里再弹出时不被压住） */
  top?: boolean
}>(), {
  size: 'md',
  top: false,
  closable: true,
  closeOnBackdrop: true,
})

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const uid = useId()
const titleId = `${uid}-title`
const panel = useTemplateRef<HTMLElement>('panel')

const close = () => {
  if (!props.closable) return
  open.value = false
  emit('close')
}
const onBackdrop = () => {
  if (props.closeOnBackdrop) close()
}

useWOverlay(open, panel, close)
</script>

<template>
  <Teleport to="body">
    <Transition name="w-modal">
      <div v-if="open" class="w-modal w-scope" :class="{ 'is-top': top }" @mousedown.self="onBackdrop">
        <div ref="panel" class="w-modal__panel" :class="`w-modal__panel--${size}`" role="dialog" aria-modal="true"
          :aria-labelledby="titleId" tabindex="-1">
          <header class="w-modal__header">
            <h2 :id="titleId" class="w-modal__title"><slot name="title">{{ title }}</slot></h2>
            <button v-if="closable" type="button" class="w-modal__close" :aria-label="t('w.modal.close')" @click="close">
              <WIcon name="close" :size="14" :stroke-width="2.2" />
            </button>
          </header>
          <div class="w-modal__body"><slot /></div>
          <footer v-if="$slots.footer" class="w-modal__footer"><slot name="footer" /></footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.w-modal {
  position: fixed;
  inset: 0;
  z-index: var(--w-z-modal);
  display: grid;
  place-items: center;
  padding: var(--w-sp-24);
  background: var(--w-backdrop);
  overflow-y: auto;
}
.w-modal.is-top { z-index: calc(var(--w-z-modal) + 5); }
.w-modal__panel {
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: var(--w-sp-8);
  padding: 20px;
  border: 1px solid var(--w-border);
  border-radius: var(--w-radius-card);
  background: var(--w-raised);
  box-shadow: var(--w-shadow-modal);
  color: var(--w-text-1);
}
.w-modal__panel:focus { outline: none; }
.w-modal__panel--sm { max-width: 420px; }
.w-modal__panel--lg { max-width: 800px; }
/* 宽表格（导入预览）：最多 1040，内容区自己滚动 */
.w-modal__panel--xl { max-width: 1040px; }
.w-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--w-sp-12);
}
.w-modal__title {
  margin: 0;
  font-size: var(--w-fs-16);
  line-height: var(--w-lh-16);
  font-weight: var(--w-fw-semibold);
}
.w-modal__close {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  margin: -2px -6px 0 0;
  padding: 0;
  border: 0;
  border-radius: var(--w-radius-control);
  background: transparent;
  color: var(--w-text-3);
  cursor: pointer;
}
.w-modal__close:hover { background: var(--w-surface-2); color: var(--w-text-1); }
.w-modal__close:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }
.w-modal__body {
  font-size: var(--w-fs-14);
  line-height: var(--w-lh-14);
  color: var(--w-text-2);
}
.w-modal__footer {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--w-sp-8);
  margin-top: var(--w-sp-8);
}

.w-modal-enter-active,
.w-modal-leave-active { transition: opacity 0.15s ease; }
.w-modal-enter-active .w-modal__panel,
.w-modal-leave-active .w-modal__panel { transition: transform 0.15s ease; }
.w-modal-enter-from,
.w-modal-leave-to { opacity: 0; }
.w-modal-enter-from .w-modal__panel,
.w-modal-leave-to .w-modal__panel { transform: translateY(8px) scale(0.98); }
@media (prefers-reduced-motion: reduce) {
  .w-modal-enter-active, .w-modal-leave-active,
  .w-modal-enter-active .w-modal__panel, .w-modal-leave-active .w-modal__panel { transition: none; }
}
</style>
