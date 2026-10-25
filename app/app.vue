<template>
  <NuxtLayout>
    <NuxtLoadingIndicator />
    <!-- here -->
    <NuxtPage />
  </NuxtLayout>
  <!-- 全站共用：提示消息（wToast / showToast）、确认框（wConfirm / wAlert） -->
  <WToastHost />
  <WDialogHost />
</template>
<script setup lang="ts">
import { startTokenRefreshMonitor } from '~/utils/auth';

const stopTokenMonitor = startTokenRefreshMonitor();
onUnmounted(stopTokenMonitor);

useHead({
  title: ' GoodsMart WMS - Admin Dashboard ',
  meta: [
  {
      name: 'viewport',
      content: "width=device-width, initial-scale=1.0",
    },
    {
      name: 'keywords',
      content: "Warehouse Management System, WMS Software, Inventory Control Solutions, Cloud-Based Logistics Management, Real-Time Inventory Tracking, Supply Chain Automation, 3PL Warehouse Software, ERP Integration, AI-Powered Forecasting, Scalable Warehouse Operations",
    },    
    // Add more meta tags as needed
  ],
})
</script>
<style>
.me-5 {
  margin-inline-end: 3rem !important;
}
</style>


<script lang="ts">
export default {
};
</script>