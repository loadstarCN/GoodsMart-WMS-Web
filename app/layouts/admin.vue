<template>
  <template v-if="authenticated">
    <Switcher />
    <div class="page">
      <Header />
      <Sidebar :menuItems="adminMenuData" />

          <!-- Start::app-content -->
          <div class="main-content app-content">
              <div class="container-fluid">
                <slot></slot>
              </div>
          </div>
          <!-- End::app-content -->
        <Footer />
    </div>
    <BackToTop />
  </template>
</template>
<script lang="ts" setup>
import { useAuthStore } from '~/stores/auth';
import { adminMenuData } from '~/data/adminMenuData.js';

const { authenticated } = storeToRefs(useAuthStore());
</script>
