<script lang="ts" setup>
/**
 * 时区小标签（如「GMT+9」「PDT」）：时刻按仓库时区显示 / 输入时，标在时间、输入框或卡片标题旁。
 * 默认只在与浏览器时区不同时显示（always 总显示，如仓库详情）；悬停显示完整时区名与偏移。
 * zone 不传时用上层 provideTimeZone / 页头选中的仓库（见 composables/useTimeZone）。
 */
import type { TimeZoneSource } from '~/composables/useTimeZone'

const props = withDefaults(defineProps<{
  zone?: TimeZoneSource
  always?: boolean
  /** 显示完整时区名（Asia/Tokyo (UTC+09:00)）而不是缩写 */
  full?: boolean
}>(), {
  zone: null,
  always: false,
  full: false,
})

const { t } = useI18n()
const { differs, abbr, description } = useTimeZone(() => props.zone)
</script>

<template>
  <span v-if="always || differs" class="badge bg-light text-muted fw-normal tz-badge align-middle"
    :title="t('timezone.shown-in', { zone: description })">
    <i class="ri-time-zone-line me-1"></i>{{ full ? description : abbr }}
  </span>
</template>

<style scoped>
.tz-badge {
  font-size: 0.6875rem;
  white-space: nowrap;
}
</style>
