<script setup lang="ts">
/**
 * 确认框 / 提示框的显示位置（app.vue 里放一个）：一次显示队首的一个（utils/wDialog 的 wConfirm / wAlert）。
 * 用 WModal（小号）：标题 16 / 600，正文 14 次要文字（保留换行）；确认框「取消」在左、确认在右，危险操作红底；
 * 提示框只有一个按钮。Esc、点遮罩、右上角关闭都当作取消。打开时焦点放在确认按钮上（Enter 确认）。
 */
import { settleDialog, wDialogQueue } from '~/utils/wDialog'

const { t } = useI18n()
const queue = wDialogQueue()
const current = computed(() => queue[0] ?? null)
const open = computed({
  get: () => !!current.value,
  set: (value: boolean) => {
    if (!value && current.value) settleDialog(current.value.id, false)
  },
})
const confirm = () => {
  if (current.value) settleDialog(current.value.id, true)
}
const cancel = () => {
  if (current.value) settleDialog(current.value.id, false)
}
</script>

<template>
  <WModal v-model:open="open" :title="current?.title || ''" size="sm" top>
    <template #title>
      <span v-if="current?.kind === 'alert' && current.tone !== 'info'" class="w-dialog__mark" :class="`is-${current.tone}`"
        aria-hidden="true">!</span>
      {{ current?.title }}
    </template>
    <p v-if="current?.message" class="w-dialog__message">{{ current.message }}</p>
    <template #footer>
      <template v-if="current?.kind === 'confirm'">
        <WButton @click="cancel">{{ current.cancelText || t('button.cancel') }}</WButton>
        <WButton :key="current.id" :variant="current.danger ? 'danger-confirm' : 'primary'" autofocus @click="confirm">
          {{ current.confirmText || t('button.confirm') }}
        </WButton>
      </template>
      <WButton v-else-if="current" :key="current.id" variant="primary" autofocus @click="confirm">
        {{ current.confirmText || t('w.dialog.ok') }}
      </WButton>
    </template>
  </WModal>
</template>

<style scoped>
.w-dialog__message {
  margin: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.w-dialog__mark {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin-right: 8px;
  border-radius: var(--w-radius-pill);
  background: var(--w-warn-dot);
  color: var(--w-neutral-900);
  font-size: 11px;
  line-height: 1;
  font-weight: var(--w-fw-semibold);
  vertical-align: 2px;
}
.w-dialog__mark.is-error { background: var(--w-bad-dot); color: #FFFFFF; }
</style>
