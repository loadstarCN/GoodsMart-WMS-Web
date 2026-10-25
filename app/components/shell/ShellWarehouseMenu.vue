<script setup lang="ts">
/**
 * 顶栏的仓库按钮与切换菜单（设计稿 Topbar / TopbarSpec「切换仓库」）：白底控件描边，指定仓库紫色图标、全部仓库灰色；
 * 名字旁标出所选仓库的时区（时间、「今天」都按它）。逻辑沿用原来的 WarehouseSelector：
 * 「全部仓库」只给公司管理员（其他员工的仓库内接口必须带仓库）；切换后整页重新加载。
 */
const { t } = useI18n()
const warehouseStore = useWarehouseStore()

const current = computed(() => warehouseStore.currentWarehouse)
const allowAll = computed(() => warehouseStore.canSelectAll)
const label = computed(() =>
  current.value?.name || (allowAll.value ? t('common.all-warehouse') : t('common.validation.warehouse-required')))
const zoneAbbr = computed(() => (current.value?.timezone ? timeZoneAbbr(current.value.timezone) : ''))
/** 悬停时的完整时区（同原来页头的时区小标签：「时间按 Asia/Tokyo (UTC+09:00) 显示」） */
const zoneTitle = computed(() =>
  (current.value?.timezone ? t('timezone.shown-in', { zone: timeZoneDescription(current.value.timezone) }) : undefined))
const zoneOf = (warehouse: WarehouseSimple) => (warehouse.timezone ? timeZoneDescription(warehouse.timezone) : '')

const select = (warehouse: WarehouseSimple | null) => {
  if ((warehouse?.id ?? null) === (current.value?.id ?? null)) return
  warehouseStore.selectWarehouse(warehouse)
  location.reload()
}
</script>

<template>
  <WDropdown :label="t('shell.warehouse.menu')" placement="bottom-end" width="280px">
    <template #trigger="{ attrs }">
      <button v-bind="attrs" type="button" class="w-wh-btn" :aria-label="t('shell.warehouse.label', { name: label })">
        <WIcon name="warehouse" :size="16" class="w-wh-btn__icon" :class="{ 'is-all': !current }" />
        <span class="w-wh-btn__name">{{ label }}</span>
        <span v-if="zoneAbbr" class="w-wh-btn__zone" :title="zoneTitle">{{ zoneAbbr }}</span>
        <WIcon name="chevron-down" :size="14" :stroke-width="2" class="w-wh-btn__chevron" />
      </button>
    </template>
    <button v-if="allowAll" type="button" class="w-menu-item w-wh-item" role="menuitemradio" :aria-checked="!current" @click="select(null)">
      <span class="w-wh-item__mark" aria-hidden="true"><WIcon v-if="!current" name="check" :size="14" :stroke-width="2.4" /></span>
      <span class="w-wh-item__text">
        <span class="w-wh-item__name">{{ t('common.all-warehouse') }}</span>
        <span class="w-wh-item__sub">{{ t('shell.warehouse.all-sub', { count: warehouseStore.warehouses.length }) }}</span>
      </span>
    </button>
    <button v-for="warehouse in warehouseStore.warehouses" :key="warehouse.id" type="button" class="w-menu-item w-wh-item"
      role="menuitemradio" :aria-checked="current?.id === warehouse.id" @click="select(warehouse)">
      <span class="w-wh-item__mark" aria-hidden="true"><WIcon v-if="current?.id === warehouse.id" name="check" :size="14" :stroke-width="2.4" /></span>
      <span class="w-wh-item__text">
        <span class="w-wh-item__name">{{ warehouse.name }}</span>
        <span v-if="zoneOf(warehouse)" class="w-wh-item__sub">{{ zoneOf(warehouse) }}</span>
      </span>
    </button>
  </WDropdown>
</template>

<style scoped>
.w-wh-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  max-width: 280px;
  padding: 0 10px 0 12px;
  border: 1px solid var(--w-border-strong);
  border-radius: var(--w-radius-control);
  background: var(--w-surface);
  color: var(--w-text-1);
  font: inherit;
  font-size: var(--w-fs-14);
  line-height: 20px;
  font-weight: var(--w-fw-semibold);
  cursor: pointer;
}
.w-wh-btn:hover { background: var(--w-surface-2); }
.w-wh-btn:focus-visible { outline: none; border-color: var(--w-sel); box-shadow: var(--w-focus-ring); }
.w-wh-btn__icon { color: var(--w-pri); }
.w-wh-btn__icon.is-all { color: var(--w-text-3); }
.w-wh-btn__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.w-wh-btn__zone {
  font-size: var(--w-fs-12);
  font-weight: var(--w-fw-medium);
  color: var(--w-text-3);
  white-space: nowrap;
}
.w-wh-btn__chevron { color: var(--w-text-3); }

.w-wh-item { min-height: 0; padding: 10px; align-items: center; }
.w-wh-item__mark {
  display: grid;
  place-items: center;
  width: 20px;
  flex: none;
  color: var(--w-pri);
}
.w-wh-item__text { display: flex; flex-direction: column; min-width: 0; }
.w-wh-item__name {
  font-weight: var(--w-fw-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.w-wh-item__sub {
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  color: var(--w-text-3);
}
@media (max-width: 767.98px) {
  .w-wh-btn { height: 34px; padding: 0 10px; font-size: var(--w-fs-12); }
  .w-wh-btn__icon, .w-wh-btn__zone, .w-wh-btn__chevron { display: none; }
}
</style>
