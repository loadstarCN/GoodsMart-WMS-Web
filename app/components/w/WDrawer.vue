<script setup lang="ts">
/**
 * 抽屉：从右侧滑出，放较长的表单、详情预览、批量操作（不离开当前列表）。行为同 WModal：
 * v-model:open、焦点进抽屉、Tab 不出抽屉、Esc / 点遮罩关闭、背景不滚动、关闭后焦点回去。
 * 底部操作放 #footer（固定在底部，右对齐）。
 */
const props = withDefaults(defineProps<{
  title: string
  /** 宽度（CSS 长度），窄屏时占满 */
  width?: string
  closable?: boolean
  closeOnBackdrop?: boolean
}>(), {
  width: '480px',
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
    <Transition name="w-drawer">
      <div v-if="open" class="w-drawer w-scope" @mousedown.self="onBackdrop">
        <aside ref="panel" class="w-drawer__panel" :style="{ width }" role="dialog" aria-modal="true"
          :aria-labelledby="titleId" tabindex="-1">
          <header class="w-drawer__header">
            <h2 :id="titleId" class="w-drawer__title"><slot name="title">{{ title }}</slot></h2>
            <button v-if="closable" type="button" class="w-drawer__close" :aria-label="t('w.modal.close')" @click="close">
              <WIcon name="close" :size="14" :stroke-width="2.2" />
            </button>
          </header>
          <div class="w-drawer__body"><slot /></div>
          <footer v-if="$slots.footer" class="w-drawer__footer"><slot name="footer" /></footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.w-drawer {
  position: fixed;
  inset: 0;
  z-index: var(--w-z-modal);
  display: flex;
  justify-content: flex-end;
  background: var(--w-backdrop);
}
.w-drawer__panel {
  max-width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--w-border);
  background: var(--w-raised);
  box-shadow: var(--w-shadow-modal);
  color: var(--w-text-1);
}
.w-drawer__panel:focus { outline: none; }
.w-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--w-sp-12);
  min-height: var(--w-topbar-h);
  padding: 0 var(--w-sp-24);
  border-bottom: 1px solid var(--w-line);
}
.w-drawer__title {
  margin: 0;
  font-size: var(--w-fs-16);
  line-height: var(--w-lh-16);
  font-weight: var(--w-fw-semibold);
}
.w-drawer__close {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  margin-right: -6px;
  padding: 0;
  border: 0;
  border-radius: var(--w-radius-control);
  background: transparent;
  color: var(--w-text-3);
  cursor: pointer;
}
.w-drawer__close:hover { background: var(--w-surface-2); color: var(--w-text-1); }
.w-drawer__close:focus-visible { outline: none; box-shadow: var(--w-focus-ring); }
.w-drawer__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--w-sp-24);
}
.w-drawer__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--w-sp-8);
  padding: var(--w-sp-16) var(--w-sp-24);
  border-top: 1px solid var(--w-line);
}

.w-drawer-enter-active,
.w-drawer-leave-active { transition: opacity 0.18s ease; }
.w-drawer-enter-active .w-drawer__panel,
.w-drawer-leave-active .w-drawer__panel { transition: transform 0.18s ease; }
.w-drawer-enter-from,
.w-drawer-leave-to { opacity: 0; }
.w-drawer-enter-from .w-drawer__panel,
.w-drawer-leave-to .w-drawer__panel { transform: translateX(24px); }
@media (prefers-reduced-motion: reduce) {
  .w-drawer-enter-active, .w-drawer-leave-active,
  .w-drawer-enter-active .w-drawer__panel, .w-drawer-leave-active .w-drawer__panel { transition: none; }
}
</style>
