<script setup lang="ts">
/**
 * 发货单的「更多」菜单（列表每行、详情页右上角共用，设计稿 DnList / Main）：修改收件地址（只在详情页）、编辑、开始作业、
 * 关闭、取消、删除。现在不能做的项照样列出、灰显并写原因（utils/dnActions）；没有权限的项不列。
 * 操作经 composables/dn/useDnActions（确认框、业务码提示）；做完 emit changed（要刷新）/ deleted；修改收件地址 emit ship-to。
 */
import { dnActionStates, type DnAction, type DnActionState } from '~/utils/dnActions'
import { useDnActions } from '~/composables/dn/useDnActions'

const props = withDefaults(defineProps<{
  dnId: number | string
  status: string | null | undefined
  /** 列出哪些操作（列表不列修改收件地址） */
  actions?: DnAction[]
  /** 列表行用小号按钮 */
  size?: 'md' | 'sm'
}>(), {
  actions: () => ['edit', 'start', 'close', 'cancel', 'delete'],
  size: 'sm',
})

const emit = defineEmits<{
  changed: []
  deleted: []
  'ship-to': []
}>()

const { t } = useI18n()
const router = useRouter()
const staffStore = useStaffStore()
const { busy, start, close, cancel, remove } = useDnActions()

const items = computed<DnActionState[]>(() =>
  dnActionStates(props.status, staffStore.hasPermission, props.actions).filter((item) => item.allowed))
const dangerous = (key: DnAction) => key === 'cancel' || key === 'delete'
/** 删除前面画一条分隔线（危险操作放最后一组） */
const divided = (key: DnAction) => key === 'close'

const onSelect = async (item: DnActionState) => {
  if (!item.enabled) return
  const id = props.dnId
  switch (item.key) {
    case 'ship-to':
      emit('ship-to')
      return
    case 'edit':
      await router.push(`/dn/edit/${id}`)
      return
    case 'start':
      if (await start(id)) emit('changed')
      return
    case 'close':
      if (await close(id)) emit('changed')
      return
    case 'cancel':
      if (await cancel(id, props.status)) emit('changed')
      return
    case 'delete':
      if (await remove(id)) emit('deleted')
  }
}
</script>

<template>
  <WDropdown v-if="items.length" :label="t('dn.actions.menu', { dn: `DN-${dnId}` })" placement="bottom-end" width="280px">
    <template #trigger="{ attrs }">
      <WButton v-bind="attrs" :size="size" :variant="size === 'sm' ? 'text' : 'secondary'" icon="more" icon-only
        :loading="!!busy" :aria-label="t('dn.actions.menu', { dn: `DN-${dnId}` })" class="dn-actions__trigger" />
    </template>
    <template v-for="item in items" :key="item.key">
      <div v-if="divided(item.key)" class="w-menu-divider" role="separator" />
      <button type="button" class="w-menu-item w-menu-item--stacked" :class="{ 'is-danger': dangerous(item.key) && item.enabled }"
        role="menuitem" :aria-disabled="!item.enabled || undefined" @click="onSelect(item)">
        <span class="w-menu-item__label">{{ t(`dn.actions.${item.key}`) }}</span>
        <span v-if="item.reason" class="w-menu-item__desc">{{ t(`dn.actions.reasons.${item.reason}`) }}</span>
      </button>
    </template>
  </WDropdown>
</template>

<style scoped>
.dn-actions__trigger.w-btn--text { color: var(--w-text-3); }
.dn-actions__trigger.w-btn--text:hover:not(:disabled) { color: var(--w-text-1); background: var(--w-surface-2); }
</style>
