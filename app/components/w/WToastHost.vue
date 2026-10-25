<script setup lang="ts">
/**
 * 提示消息的显示位置（app.vue 里放一个）：右上角，深色条（中性 900 底、白字），左边语义色的圆形图标，
 * 可带一个操作（撤销）和关闭按钮；鼠标停在上面或键盘焦点在里面时暂停计时。
 * 读屏：容器是礼貌播报区（成功 / 信息），出错 / 需处理的条另加 role="alert"。消息由 utils/wToast 的 wToast() 加入。
 */
import { dismissToast, pauseToast, scheduleToast, wToastItems, type WToastItem } from '~/utils/wToast'

const { t } = useI18n()
const items = wToastItems()

const runAction = (item: WToastItem) => {
  item.action?.onClick()
  dismissToast(item.id)
}
</script>

<template>
  <div class="w-toasts w-scope" aria-live="polite" aria-relevant="additions">
    <TransitionGroup name="w-toast">
      <div v-for="item in items" :key="item.id" class="w-toast" :class="`is-${item.tone}`"
        :role="item.tone === 'error' || item.tone === 'warning' ? 'alert' : undefined"
        @mouseenter="pauseToast(item.id)" @mouseleave="scheduleToast(item.id)"
        @focusin="pauseToast(item.id)" @focusout="scheduleToast(item.id)">
        <span class="w-toast__icon" aria-hidden="true">
          <WIcon v-if="item.tone === 'success'" name="check" :size="11" :stroke-width="3.4" />
          <template v-else-if="item.tone === 'info'">i</template>
          <template v-else>!</template>
        </span>
        <span class="w-toast__message">{{ item.message }}</span>
        <button v-if="item.action" type="button" class="w-toast__action" @click="runAction(item)">{{ item.action.label }}</button>
        <button type="button" class="w-toast__close" :aria-label="t('w.toast.close')" @click="dismissToast(item.id)">
          <WIcon name="close" :size="12" :stroke-width="2.4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.w-toasts {
  position: fixed;
  top: calc(var(--w-topbar-h) + 12px);
  right: 16px;
  z-index: var(--w-z-tooltip);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  width: min(420px, calc(100vw - 32px));
  pointer-events: none;
}
.w-toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: 100%;
  padding: 10px 10px 10px 14px;
  border-radius: var(--w-radius-control);
  background: var(--w-neutral-900);
  color: #FFFFFF;
  font-family: var(--w-font);
  font-size: var(--w-fs-14);
  line-height: var(--w-lh-14);
  box-shadow: var(--w-shadow-raised);
  pointer-events: auto;
}
.w-toast__icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border-radius: var(--w-radius-pill);
  background: var(--w-ok-dot);
  color: #FFFFFF;
  font-size: 11px;
  line-height: 1;
  font-weight: var(--w-fw-semibold);
}
.w-toast.is-error .w-toast__icon { background: var(--w-bad-dot); }
.w-toast.is-warning .w-toast__icon { background: var(--w-warn-dot); color: var(--w-neutral-900); }
.w-toast.is-info .w-toast__icon { background: var(--w-info-dot); }
.w-toast__message {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: pre-line;
}
.w-toast__action {
  flex: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--w-brand-300);
  font: inherit;
  font-weight: var(--w-fw-semibold);
  cursor: pointer;
}
.w-toast__action:hover { color: var(--w-brand-200); }
.w-toast__close {
  display: grid;
  place-items: center;
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: var(--w-radius-control);
  background: transparent;
  color: var(--w-neutral-400);
  cursor: pointer;
}
.w-toast__close:hover { background: rgba(255, 255, 255, 0.1); color: #FFFFFF; }
.w-toast__action:focus-visible,
.w-toast__close:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--w-brand-300); border-radius: 4px; }

.w-toast-enter-active,
.w-toast-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.w-toast-enter-from,
.w-toast-leave-to { opacity: 0; transform: translateX(16px); }
@media (prefers-reduced-motion: reduce) {
  .w-toast-enter-active, .w-toast-leave-active { transition: none; }
}
@media print {
  .w-toasts { display: none; }
}
</style>
