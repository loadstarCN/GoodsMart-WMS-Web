<script setup>
const { t } = useI18n();

const props = defineProps({
  allPermissions: { type: Array, required: true },
  modelValue: { type: Array, required: true },
});

const emit = defineEmits(['update:modelValue']);

const selected = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

// 模块分组定义、操作文案：见 utils/permissionGroups.ts（与 API 密钥列表的权限列共用）
const CATEGORIES = PERMISSION_CATEGORIES;

// 查找权限对象 by name
const permByName = computed(() => {
  const map = {};
  for (const p of props.allPermissions) {
    map[p.name] = p;
  }
  return map;
});

// 构建分组数据（自动过滤空模块和空分类）
const groupedData = computed(() => {
  return CATEGORIES.map(cat => ({
    label: cat.label,
    modules: cat.modules.map(mod => {
      if (mod.perms) {
        const items = mod.perms
          .map(name => permByName.value[name])
          .filter(Boolean);
        return { label: mod.label, items, isSpecial: true };
      }
      const ops = mod.ops || DEFAULT_PERMISSION_OPS;
      const items = ops.map(op => ({
        op,
        opLabel: permissionOpLabelKey(mod, op),
        perm: permByName.value[`${mod.prefix}_${op}`] || null,
      }));
      return { label: mod.label, items, isSpecial: false };
    }).filter(mod => mod.isSpecial ? mod.items.length > 0 : mod.items.some(i => i.perm)),
  })).filter(cat => cat.modules.length > 0);
});

const toggle = (permId) => {
  const arr = [...selected.value];
  const idx = arr.indexOf(permId);
  if (idx > -1) {
    arr.splice(idx, 1);
  } else {
    arr.push(permId);
  }
  selected.value = arr;
};

const selectAll = () => {
  selected.value = props.allPermissions.map(p => p.id);
};

const clearAll = () => {
  selected.value = [];
};

// 按分类全选/取消
const toggleCategory = (cat) => {
  const catPermIds = [];
  for (const mod of cat.modules) {
    if (mod.isSpecial) {
      catPermIds.push(...mod.items.map(p => p.id));
    } else {
      catPermIds.push(...mod.items.filter(i => i.perm).map(i => i.perm.id));
    }
  }
  const allSelected = catPermIds.every(id => selected.value.includes(id));
  if (allSelected) {
    selected.value = selected.value.filter(id => !catPermIds.includes(id));
  } else {
    const newSet = new Set([...selected.value, ...catPermIds]);
    selected.value = [...newSet];
  }
};

const isCategoryAllSelected = (cat) => {
  const catPermIds = [];
  for (const mod of cat.modules) {
    if (mod.isSpecial) {
      catPermIds.push(...mod.items.map(p => p.id));
    } else {
      catPermIds.push(...mod.items.filter(i => i.perm).map(i => i.perm.id));
    }
  }
  return catPermIds.length > 0 && catPermIds.every(id => selected.value.includes(id));
};
</script>

<template>
  <div>
    <div class="mb-2 d-flex gap-2 align-items-center">
      <button type="button" class="btn btn-sm btn-outline-primary" @click="selectAll">{{ t('admin.roles.select-all') }}</button>
      <button type="button" class="btn btn-sm btn-outline-secondary" @click="clearAll">{{ t('admin.roles.clear-all') }}</button>
      <span class="badge bg-primary-transparent">{{ selected.length }} / {{ allPermissions.length }}</span>
    </div>

    <div class="accordion accordion-customicon1" id="permAccordion">
      <div v-for="(cat, catIdx) in groupedData" :key="catIdx" class="accordion-item">
        <h2 class="accordion-header">
          <button class="accordion-button" :class="{ collapsed: catIdx > 0 }" type="button"
            data-bs-toggle="collapse" :data-bs-target="`#permCat${catIdx}`">
            <div class="d-flex align-items-center gap-2 w-100">
              <input class="form-check-input me-1" type="checkbox" :checked="isCategoryAllSelected(cat)"
                @click.stop="toggleCategory(cat)">
              <span class="fw-semibold">{{ t(cat.label) }}</span>
            </div>
          </button>
        </h2>
        <div :id="`permCat${catIdx}`" class="accordion-collapse collapse" :class="{ show: catIdx === 0 }">
          <div class="accordion-body p-0">
            <table class="table table-bordered mb-0">
              <tbody>
                <tr v-for="(mod, modIdx) in cat.modules" :key="modIdx">
                  <td class="fw-semibold bg-light" style="width: 140px; vertical-align: middle;">{{ t(mod.label) }}</td>
                  <td>
                    <template v-if="mod.isSpecial">
                      <div class="d-flex flex-wrap gap-3">
                        <div v-for="perm in mod.items" :key="perm.id" class="form-check form-check-inline mb-0">
                          <input class="form-check-input" type="checkbox" :id="`perm-${perm.id}`"
                            :checked="selected.includes(perm.id)" @change="toggle(perm.id)">
                          <label class="form-check-label" :for="`perm-${perm.id}`">{{ perm.name }}</label>
                        </div>
                      </div>
                    </template>
                    <template v-else>
                      <div class="d-flex flex-wrap gap-3">
                        <div v-for="item in mod.items" :key="item.op" class="form-check form-check-inline mb-0">
                          <template v-if="item.perm">
                            <input class="form-check-input" type="checkbox" :id="`perm-${item.perm.id}`"
                              :checked="selected.includes(item.perm.id)" @change="toggle(item.perm.id)">
                            <label class="form-check-label" :for="`perm-${item.perm.id}`">{{ t(item.opLabel) }}</label>
                          </template>
                        </div>
                      </div>
                    </template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.accordion-button {
  padding: 0.5rem 1rem;
}
.accordion-body table td {
  padding: 0.4rem 0.75rem;
}
.form-check-inline {
  min-width: 70px;
}
</style>
