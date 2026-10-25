<template>
  <ShellFrame v-if="authenticated" variant="admin">
    <slot />
  </ShellFrame>
</template>
<script lang="ts" setup>
// 平台管理端外壳（与员工端同一套侧栏 / 顶栏样式，没有仓库和搜索）；菜单在 data/navigation.ts 的 ADMIN_NAV 里维护
import { useAuthStore } from '~/stores/auth';

const { authenticated } = storeToRefs(useAuthStore());
</script>
