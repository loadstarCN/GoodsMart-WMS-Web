<template>
  <div class="btn-group btn-list mt-2 ms-2">
    <button 
      type="button" 
      class="btn btn-sm btn-outline-secondary dropdown-toggle rounded-pill"
      data-bs-toggle="dropdown" 
      aria-expanded="false"
    >
      {{ selectedLabel || 'Select Warehouse' }}
      <i class="bx bx-chevron-down"></i>
    </button>
    <ul class="dropdown-menu">
      <li>
        <a class="dropdown-item" href="javascript:void(0);" @click="handleSelect(null)">
          {{ t('common.all-warehouse') }}
        </a>
      </li>
      <li><hr class="dropdown-divider"></li>
      <li v-for="warehouse in warehouses" :key="warehouse.id">
        <a class="dropdown-item" href="javascript:void(0);" @click="handleSelect(warehouse)">
          {{ warehouse.name }}
        </a>
      </li>
    </ul>
  </div>
</template>

<script setup>
defineProps({
  warehouses: {
    type: Array,
    default: () => []
  },
  selectedLabel: {
    type: String,
    default: ''
  }
});

// 获取国际化方法
const { t } = useI18n();

const emit = defineEmits(['select']);

const handleSelect = (warehouse) => {
  emit('select', warehouse);
};
</script>

<style scoped>
/* 继承原有样式，可自定义覆盖 */
.dropdown-menu {
  max-height: 300px;
  overflow-y: auto;
}
</style>