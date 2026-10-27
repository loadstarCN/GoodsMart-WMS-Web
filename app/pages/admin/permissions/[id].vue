<script lang="ts" setup>

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
});

const { t } = useI18n();
// 保存失败按业务码显示三语文案（如内置权限改代码 11011）
const { bizErrorMessage } = useBizError();
const router = useRouter();
const route = useRoute();
const itemId = route.params.id;

const dataToPass = computed(() => ({
  current: t('admin.permissions.operations.edit'),
  list: [t('admin.title'), t('admin.nav.permissions'), t('admin.permissions.operations.edit')]
}));

let loading = ref(true);
const loadError=ref('');
let saving = ref(false);

let itemData = ref({
  name: '',
  description: '',
});
// 内置权限：权限代码只读（描述可以改）；后端还没有 is_builtin 时按 false
const isBuiltin = ref(false);

let errors = ref<Record<string, string>>({});

const fetchData = async () => {
  loading.value = true;
  loadError.value='';
  await httpRequest<any>(`/api/system/user/permissions/${itemId}`, {
    method: 'GET',
    onSuccess: (data) => {
      itemData.value = {
        name: data.name || '',
        description: data.description || '',
      };
      isBuiltin.value = data.is_builtin === true;
    },
    onError: (error) => {
      loadError.value=bizErrorMessage(error);
      showToast(error.message, 'error');
    },
    onFinally: () => {
      loading.value = false;
    }
  });
};

const validate = () => {
  errors.value = {};
  if (!itemData.value.name?.trim()) {
    errors.value.name = t('common.validation.name-required', { entity: t('admin.permissions.entity') });
  }
  return Object.keys(errors.value).length === 0;
};

const submitForm = async () => {
  if(saving.value||loading.value||loadError.value)return;
  if (!validate()) return;
  saving.value = true;
  await httpRequest(`/api/system/user/permissions/${itemId}`, {
    method: 'PUT',
    body: itemData.value,
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success');
      router.push('/admin/permissions/');
    },
    onError: (error) => {
      showToast(bizErrorMessage(error), 'error');
    },
    onFinally: () => {
      saving.value = false;
    }
  });
};

onMounted(() => {
  fetchData();
});

useHead({title:()=>t('admin.permissions.operations.edit')})
</script>
<template><div class="w-permission-form w-scope"><header><h1>{{t('admin.permissions.operations.edit')}}</h1></header><WAlert v-if="loadError" tone="block" :title="loadError"/><WCard flush><form @submit.prevent="submitForm"><WFormSection :title="t('common.fields.name')"><div class="fields"><WField :label="t('common.fields.name')" required :error="errors.name" :hint="isBuiltin?t('admin.builtin.permission-tip'):undefined"><WInput :disabled="loading||saving||!!loadError" v-model="itemData.name" :readonly="isBuiltin"/></WField><WField :label="t('common.fields.description')"><WTextarea :disabled="loading||saving||!!loadError" v-model="itemData.description" :rows="3"/></WField></div></WFormSection><footer><WButton to="/admin/permissions">{{t('button.cancel')}}</WButton><WButton type="submit" variant="primary" :loading="saving" :disabled="loading||!!loadError">{{t('button.save')}}</WButton></footer></form></WCard></div></template><style scoped>.w-permission-form{display:flex;flex-direction:column;gap:16px}h1{margin:0;font-size:24px;line-height:32px;font-weight:600}.fields{display:flex;flex-direction:column;gap:16px;max-width:600px}footer{display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--w-border)}</style>