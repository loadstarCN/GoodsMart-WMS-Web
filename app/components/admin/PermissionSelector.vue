<script setup>
const { t } = useI18n();

const props = defineProps({
  allPermissions: { type: Array, required: true },
  matrix: { type: Boolean, default: false },
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

const otherPermissions=computed(()=>{const known=new Set();for(const cat of groupedData.value)for(const mod of cat.modules)for(const item of mod.items){const p=mod.isSpecial?item:item.perm;if(p)known.add(p.id)}return props.allPermissions.filter(p=>!known.has(p.id))})
</script>
<template><div class="w-permissions w-scope" :class="{'w-permissions--matrix':matrix}"><div v-if="matrix" class="matrix-scroll"><table><colgroup><col style="width:25%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col></colgroup><thead><tr><th>{{t('admin.roles.fields.permissions')}}</th><th v-for="op in ['read','edit','delete']" :key="op">{{t('admin.permissions.ops.'+op)}}</th><th>{{t('role-review.other')}}</th></tr></thead><tbody v-for="cat in groupedData" :key="cat.label"><tr class="matrix-category"><th colspan="5">{{t(cat.label)}}</th></tr><tr v-for="mod in cat.modules" :key="mod.label"><th scope="row">{{t(mod.label)}}</th><td v-for="op in ['read','edit','delete']" :key="op"><template v-if="!mod.isSpecial"><template v-for="item in mod.items" :key="item.op"><WCheckbox v-if="item.op===op&&item.perm&&item.opLabel==='admin.permissions.ops.'+op" :model-value="selected.includes(item.perm.id)" :aria-label="t(mod.label)+' '+t(item.opLabel)" @update:model-value="toggle(item.perm.id)"/></template></template></td><td class="matrix-extra"><template v-if="mod.isSpecial"><WCheckbox v-for="permission in mod.items" :key="permission.id" :model-value="selected.includes(permission.id)" @update:model-value="toggle(permission.id)">{{permission.name}}</WCheckbox></template><template v-else><template v-for="item in mod.items" :key="item.op"><WCheckbox v-if="item.perm&&(!['read','edit','delete'].includes(item.op)||item.opLabel!=='admin.permissions.ops.'+item.op)" :model-value="selected.includes(item.perm.id)" @update:model-value="toggle(item.perm.id)">{{t(item.opLabel)}}</WCheckbox></template></template></td></tr></tbody><tbody v-if="otherPermissions.length"><tr><th>{{t('role-review.other')}}</th><td colspan="4" class="matrix-extra"><WCheckbox v-for="permission in otherPermissions" :key="permission.id" :model-value="selected.includes(permission.id)" @update:model-value="toggle(permission.id)">{{permission.name}}</WCheckbox></td></tr></tbody></table></div><template v-else><div class="tools"><WButton size="sm" @click="selectAll">{{t('admin.roles.select-all')}}</WButton><WButton size="sm" @click="clearAll">{{t('admin.roles.clear-all')}}</WButton><span>{{selected.length}} / {{allPermissions.length}}</span></div><section v-for="cat in groupedData" :key="cat.label"><div class="category"><WCheckbox :model-value="isCategoryAllSelected(cat)" @update:model-value="toggleCategory(cat)">{{t(cat.label)}}</WCheckbox></div><div v-for="mod in cat.modules" :key="mod.label" class="module"><span>{{t(mod.label)}}</span><div class="choices"><template v-if="mod.isSpecial"><WCheckbox v-for="permission in mod.items" :key="permission.id" :model-value="selected.includes(permission.id)" @update:model-value="toggle(permission.id)">{{permission.name}}</WCheckbox></template><template v-else><template v-for="item in mod.items" :key="item.op"><WCheckbox v-if="item.perm" :model-value="selected.includes(item.perm.id)" @update:model-value="toggle(item.perm.id)">{{t(item.opLabel)}}</WCheckbox></template></template></div></div></section><section v-if="otherPermissions.length" class="other"><WCheckbox v-for="permission in otherPermissions" :key="permission.id" :model-value="selected.includes(permission.id)" @update:model-value="toggle(permission.id)">{{permission.name}}</WCheckbox></section></template></div></template>
<style scoped>
.w-permissions{display:flex;flex-direction:column;gap:12px}.tools{display:flex;align-items:center;gap:8px}.tools span{margin-left:auto;color:var(--w-text-3);font-size:12px}.w-permissions section{border:1px solid var(--w-border);border-radius:6px;overflow:hidden}.category{padding:10px 12px;background:#F6F7FA;font-size:13px;font-weight:500}.module{display:grid;grid-template-columns:100px minmax(0,1fr);gap:12px;padding:12px;border-top:1px solid var(--w-line);font-size:13px;line-height:20px}.module>span{color:var(--w-text-3)}.choices,.other{display:flex;flex-wrap:wrap;gap:12px 16px}.other{padding:12px}.choices :deep(.w-check){font-size:13px}@media(max-width:400px){.module{grid-template-columns:80px minmax(0,1fr);gap:8px}}
.matrix-scroll{overflow-x:auto}.matrix-scroll table{table-layout:fixed;width:100%;min-width:620px;border-collapse:collapse;font-size:13px;line-height:20px}.matrix-scroll th,.matrix-scroll td{padding:10px 8px;border-top:1px solid var(--w-line);text-align:center;font-weight:400}.matrix-scroll th:first-child{padding-left:24px;text-align:left}.matrix-scroll th:last-child,.matrix-scroll td:last-child{padding-right:24px;text-align:left}.matrix-scroll thead th{padding-top:10px;padding-bottom:8px;border-bottom:1px solid var(--w-border);color:var(--w-text-3);font-size:12px;line-height:16px;font-weight:500}.matrix-scroll tbody th[scope=row]{font-size:14px;line-height:20px}.matrix-scroll .matrix-category th{padding:16px 24px 4px;font-size:12px;line-height:18px;font-weight:600;color:var(--w-text-2)}.matrix-extra :deep(.w-check){margin:2px 12px 2px 0;font-size:13px}.matrix-scroll td:not(.matrix-extra) :deep(.w-check){display:inline-flex;vertical-align:middle}
</style>
