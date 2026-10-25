<template>
  <ShellFrame v-if="authenticated" variant="wms">
    <slot />
  </ShellFrame>
</template>
<script lang="ts" setup>
// 员工端外壳（侧栏 + 顶栏，见 components/shell）；菜单在 data/navigation.ts 的 WMS_NAV 里维护
import { useAuthStore } from '~/stores/auth';

const { authenticated } = storeToRefs(useAuthStore());
</script>
