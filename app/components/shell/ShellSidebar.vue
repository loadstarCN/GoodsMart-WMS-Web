<script setup lang="ts">
/**
 * 侧栏（设计稿 Sidebar.dc.html / AdminSidebar.dc.html）：深底，菜单项高 36，选中底 + 浅紫图标；
 * 分组名 12 灰字；收起时只留图标（宽 72），分组名换成分隔线，徽标换成右上角琥珀点。
 * 菜单与路由的对应、权限、哪些页面还没做，都在 data/navigation.ts 里维护。
 */
import { matchNavItem, type NavGroup, type NavItem } from '~/data/navigation'

const props = withDefaults(defineProps<{
  groups: NavGroup[]
  variant?: 'wms' | 'admin'
  collapsed?: boolean
}>(), {
  variant: 'wms',
  collapsed: false,
})

const emit = defineEmits<{ navigate: [] }>()
const { t, locale } = useI18n()
const route = useRoute()
const staffStore = useStaffStore()
const brand = useRuntimeConfig().public.brand

/** 按权限过滤（平台管理端不过滤）；没做好的页面不显示；一组里一项都不剩时整组不显示 */
const visibleGroups = computed(() => props.groups
  .map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      item.ready && (props.variant === 'admin' || !item.permission || staffStore.hasPermission(...([] as string[]).concat(item.permission)))),
  }))
  .filter((group) => group.items.length > 0))

const activeKey = computed(() => matchNavItem(props.groups, route))

// ---- 上架徽标：当前仓库待上架件数（GET /inventory/pending-putaway/summary 的 total_quantity），0 时不显示 ----
const putawayCount = ref(0)
let putawayFetchedAt = 0
const hasPutawayBadge = computed(() => visibleGroups.value.some((group) => group.items.some((item) => item.badge === 'putaway')))

const fetchPutaway = async (force = false) => {
  if (!hasPutawayBadge.value) return
  // 切页时最多 30 秒刷新一次；换仓库会整页重新加载
  if (!force && Date.now() - putawayFetchedAt < 30_000) return
  putawayFetchedAt = Date.now()
  await httpRequest<{ total_quantity?: number }>('/api/warehouse/inventory/pending-putaway/summary', {
    method: 'GET',
    onSuccess: (data) => { putawayCount.value = Number(data?.total_quantity) || 0 },
    onError: () => { putawayCount.value = 0 },
  })
}
onMounted(() => fetchPutaway(true))
watch(() => route.fullPath, () => fetchPutaway())

const badgeOf = (item: NavItem) => (item.badge === 'putaway' && putawayCount.value > 0 ? putawayCount.value.toLocaleString(locale.value) : '')
/** 有徽标时链接的名称要带上数字（徽标本身对读屏隐藏） */
const ariaLabelOf = (item: NavItem) => {
  const badge = badgeOf(item)
  return badge ? t('shell.putaway-badge', { label: t(item.label), count: badge }) : undefined
}
</script>

<template>
  <nav class="w-sidebar" :class="{ 'is-collapsed': collapsed }"
    :aria-label="variant === 'admin' ? t('shell.admin-nav-label') : t('shell.nav-label')">
    <div class="w-sidebar__brand" :class="{ 'is-admin': variant === 'admin' }">
      <NuxtLink :to="variant === 'admin' ? '/admin' : '/'" class="w-sidebar__logo"
        :aria-label="t('shell.home-link', { name: brand.productName })" @click="emit('navigate')">
        <img v-if="collapsed" :src="brand.logoMark" alt="" class="w-sidebar__mark">
        <img v-else :src="brand.logoOnDark" alt="" class="w-sidebar__wordmark">
      </NuxtLink>
      <span v-if="variant === 'admin' && !collapsed" class="w-sidebar__platform">{{ t('shell.account.platform') }}</span>
    </div>

    <div class="w-sidebar__scroll">
      <div v-for="(group, gi) in visibleGroups" :key="group.key" class="w-sidebar__group">
        <div v-if="group.label && !collapsed" class="w-sidebar__group-label">{{ t(group.label) }}</div>
        <div v-else-if="collapsed && gi > 0" class="w-sidebar__divider" aria-hidden="true" />
        <ul class="w-sidebar__list" :aria-label="group.label ? t(group.label) : undefined">
          <li v-for="item in group.items" :key="item.key">
            <NuxtLink :to="item.to" class="w-sidebar__item" :class="{ 'is-active': item.key === activeKey }"
              :aria-current="item.key === activeKey ? 'page' : undefined" :aria-label="ariaLabelOf(item)"
              :title="collapsed ? (ariaLabelOf(item) || t(item.label)) : undefined" @click="emit('navigate')">
              <WIcon :name="item.icon" :size="18" class="w-sidebar__icon" />
              <span class="w-sidebar__label" :class="{ 'w-sr-only': collapsed }">{{ t(item.label) }}</span>
              <template v-if="badgeOf(item)">
                <span v-if="!collapsed" class="w-sidebar__badge" aria-hidden="true">
                  <span class="w-sidebar__badge-dot" />{{ badgeOf(item) }}
                </span>
                <span v-else class="w-sidebar__dot" aria-hidden="true" />
              </template>
            </NuxtLink>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.w-sidebar {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--w-sb-bg);
  color: var(--w-sb-text);
  font-family: var(--w-font);
}
.w-sidebar__brand {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 12px 12px 4px;
}
.w-sidebar__logo {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 12px;
  border-radius: var(--w-radius-control);
}
.w-sidebar__brand.is-admin .w-sidebar__logo { height: 32px; }
.w-sidebar__logo:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--w-sb-active-icon); }
.w-sidebar__wordmark { display: block; height: 18px; width: auto; max-width: 100%; }
.w-sidebar__mark { display: block; width: 26px; height: 26px; }
.w-sidebar__platform {
  margin: 0 12px;
  padding: 0 6px;
  border-radius: var(--w-radius-control);
  background: var(--w-sb-active);
  color: var(--w-sb-active-icon);
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  font-weight: var(--w-fw-medium);
  white-space: nowrap;
}
.w-sidebar.is-collapsed .w-sidebar__brand { align-items: center; }
.w-sidebar.is-collapsed .w-sidebar__logo { justify-content: center; padding: 0; width: 100%; }

.w-sidebar__scroll {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 12px 32px;
  overflow-y: auto;
  overflow-x: hidden;
  /* 滚动条平时不显示，鼠标移上来才出现（深底上的浅色滚动条很抢眼） */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.w-sidebar__scroll:hover,
.w-sidebar__scroll:focus-within { scrollbar-color: var(--w-sb-line) transparent; }
.w-sidebar.is-collapsed .w-sidebar__scroll { gap: 8px; }
.w-sidebar__group { display: flex; flex-direction: column; gap: 2px; }
.w-sidebar__group-label {
  padding: 0 12px 4px;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  font-weight: var(--w-fw-medium);
  color: var(--w-sb-label);
  white-space: nowrap;
}
.w-sidebar__divider {
  height: 1px;
  margin: 0 8px 6px;
  background: var(--w-sb-line);
}
.w-sidebar__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.w-sidebar__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 36px;
  padding: 0 12px;
  border-radius: var(--w-radius-control);
  color: var(--w-sb-text);
  font-size: var(--w-fs-14);
  line-height: 20px;
  font-weight: var(--w-fw-regular);
  text-decoration: none;
  white-space: nowrap;
}
.w-sidebar__item:hover { background: var(--w-sb-hover); color: var(--w-sb-text-active); }
.w-sidebar__item:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--w-sb-active-icon); }
.w-sidebar__icon { color: var(--w-sb-label); }
.w-sidebar__item.is-active {
  background: var(--w-sb-active);
  color: var(--w-sb-text-active);
  font-weight: var(--w-fw-semibold);
}
.w-sidebar__item.is-active .w-sidebar__icon { color: var(--w-sb-active-icon); }
.w-sidebar__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.w-sidebar.is-collapsed .w-sidebar__item { justify-content: center; padding: 0; }

.w-sidebar__badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  font-size: var(--w-fs-12);
  line-height: var(--w-lh-12);
  font-weight: var(--w-fw-medium);
  color: var(--w-sb-text);
  font-variant-numeric: tabular-nums;
}
.w-sidebar__badge-dot,
.w-sidebar__dot {
  border-radius: var(--w-radius-pill);
  background: var(--w-warn-dot);
}
.w-sidebar__badge-dot { width: 6px; height: 6px; }
.w-sidebar__dot {
  position: absolute;
  top: 7px;
  right: 12px;
  width: 8px;
  height: 8px;
  box-shadow: 0 0 0 2px var(--w-sb-bg);
}
</style>
