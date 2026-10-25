<script setup lang="ts">
/**
 * 上架弹窗里的待上架提示：
 *   待上架：良品 N · 破损 M
 *   有破损待上架、目标不是破损库位时：「破损品请上架至破损库位」；本仓库没有破损库位时给「新建破损库位」入口，
 *   有时给「只看破损库位」（emit pick-damaged，把破损库位列表交给库位下拉）。
 */
import { fetchDamagedLocations, isDamagedLocation, type PendingPutaway } from '~/composables/inventory/putawayStock'

const props = defineProps<{
  pending: PendingPutaway | null
  /** 目标库位的类型（还没选库位时不传） */
  locationType?: string | null
  /** 待上架所在的仓库（查破损库位、新建破损库位用） */
  warehouseId?: number | string | null
  /** 多仓库时在前面标出仓库名 */
  warehouseName?: string | null
  /** 显示「只看破损库位」（目标库位可选时） */
  canPickDamaged?: boolean
}>()

const emit = defineEmits<{ 'pick-damaged': [locations: any[]] }>()

const { t } = useI18n()

/** 本仓库的破损库位：null = 还不知道 / 读不到 */
const damagedLocations = ref<any[] | null>(null)

const needsDamagedLocation = computed(() =>
  !!props.pending && props.pending.damaged > 0 && !isDamagedLocation(props.locationType))

watch(
  () => [props.warehouseId, needsDamagedLocation.value] as const,
  async ([warehouseId, needed]) => {
    damagedLocations.value = null
    if (!needed || warehouseId === null || warehouseId === undefined || warehouseId === '') return
    const list = await fetchDamagedLocations(warehouseId, true)
    // 仓库在等待期间换了：丢弃旧结果
    if (String(props.warehouseId) === String(warehouseId)) damagedLocations.value = list
  },
  { immediate: true },
)

const createDamagedLocationLink = computed(() => ({
  path: '/location/add',
  query: { location_type: 'damaged', ...(props.warehouseId ? { warehouse_id: String(props.warehouseId) } : {}) },
}))
</script>

<template>
  <div v-if="pending" class="fs-12">
    <div :class="pending.total > 0 ? 'text-default' : 'text-muted'">
      <i class="ri-inbox-archive-line me-1"></i>
      <template v-if="warehouseName">{{ warehouseName }} · </template>
      <template v-if="pending.total > 0">
        {{ t('putaway.pending', { good: pending.good, damaged: pending.damaged }) }}
      </template>
      <template v-else>{{ t('putaway.none') }}</template>
    </div>
    <div v-if="needsDamagedLocation" class="text-warning mt-1">
      <i class="ri-error-warning-line me-1"></i>{{ t('putaway.damaged-hint') }}
      <template v-if="damagedLocations && damagedLocations.length === 0">
        · {{ t('putaway.no-damaged-location') }}
        <NuxtLink :to="createDamagedLocationLink" target="_blank" class="ms-1">
          <i class="ri-add-line"></i>{{ t('putaway.create-damaged-location') }}
        </NuxtLink>
      </template>
      <a v-else-if="canPickDamaged && damagedLocations && damagedLocations.length > 0" href="javascript:void(0);" class="ms-1"
        @click="emit('pick-damaged', damagedLocations)">{{ t('putaway.show-damaged-locations') }}</a>
    </div>
  </div>
</template>
