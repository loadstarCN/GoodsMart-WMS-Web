<script lang="ts" setup>

import BasicCardComponent from "@/components/@spk/basic-cards.vue";
// 定义页面元数据
definePageMeta({
  middleware: ["auth"],
});

// 获取国际化方法
const { t } = useI18n();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('welcome-wms.title'),
  list: [t('nav.home'), t('nav.welcome')]
}));


</script>


<template>
  <PageHeader :propData="dataToPass" />

  <!-- Start::row-1 -->
  <div class="row mb-5">
    <p>{{ $t('welcome-wms.description') }}</p>
  </div>

  <!--End::row-1 -->



</template>

<style scoped>
</style>
