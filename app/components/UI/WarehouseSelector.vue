<template>
  <div class="btn-group btn-list mt-2 ms-2">
    <button 
      type="button" 
      class="btn btn-sm btn-outline-secondary dropdown-toggle rounded-pill"
      data-bs-toggle="dropdown" 
      aria-expanded="false"
    >
      {{ selectedLabel || (allowAll ? t('common.all-warehouse') : t('common.validation.warehouse-required')) }}
      <i class="ri-arrow-down-s-line"></i>
    </button>
    <ul class="dropdown-menu">
      <!-- 「全部仓库」只给公司管理员：其他员工的仓库内接口必须带仓库，选全部会 14003 -->
      <template v-if="allowAll">
        <li>
          <a class="dropdown-item" href="javascript:void(0);" @click="handleSelect(null)">
            {{ t('common.all-warehouse') }}
          </a>
        </li>
        <li><hr class="dropdown-divider"></li>
      </template>
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
  },
  // 是否提供「全部仓库」选项（只有公司管理员）
  allowAll: {
    type: Boolean,
    default: true
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