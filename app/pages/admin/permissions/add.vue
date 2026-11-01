<script lang="ts" setup>

definePageMeta({
  layout: 'admin',
  middleware: 'admin'
});

const { t } = useI18n();
const router = useRouter();
const {bizErrorMessage}=useBizError();
const saveError=ref('');

const dataToPass = computed(() => ({
  current: t('admin.permissions.operations.add'),
  list: [t('admin.title'), t('admin.nav.permissions'), t('admin.permissions.operations.add')]
}));

let loading = ref(false);

let itemData = ref({
  name: '',
  description: '',
});

const original=ref(JSON.stringify(itemData.value));
useUnsavedForm(()=>JSON.stringify(itemData.value)!==original.value,()=>loading.value);

let errors = ref<Record<string, string>>({});

const validate = () => {
  errors.value = {};
  if (!itemData.value.name?.trim()) {
    errors.value.name = t('common.validation.name-required', { entity: t('admin.permissions.entity') });
  }
  return Object.keys(errors.value).length === 0;
};

const submitForm = async () => {
  if(loading.value)return;
  saveError.value='';
  if (!validate()) return;
  loading.value = true;
  await httpRequest('/api/system/user/permissions', {
    method: 'POST',
    body: itemData.value,
    onSuccess: async () => {
      original.value=JSON.stringify(itemData.value);
      showToast(t('action-results.success'), 'success');
      router.push('/admin/permissions/');
    },
    onError: (error) => {
      saveError.value=bizErrorMessage(error);
      showToast(saveError.value, 'error');
    },
    onFinally: () => {
      loading.value = false;
    }
  });
};

useHead({title:()=>t('admin.permissions.operations.add')})
</script>
<template><div class="w-permission-form w-scope"><header><h1>{{t('admin.permissions.operations.add')}}</h1></header><WAlert v-if="saveError" tone="block" :title="saveError"/><WCard flush><form @submit.prevent="submitForm"><WFormSection :title="t('common.fields.name')"><div class="fields"><WField :label="t('common.fields.name')" required :error="errors.name"><WInput :disabled="loading" v-model="itemData.name"/></WField><WField :label="t('common.fields.description')"><WTextarea :disabled="loading" v-model="itemData.description" :rows="3"/></WField></div></WFormSection><footer><WButton to="/admin/permissions">{{t('button.cancel')}}</WButton><WButton type="submit" variant="primary" :loading="loading">{{t('button.save')}}</WButton></footer></form></WCard></div></template><style scoped>.w-permission-form{display:flex;flex-direction:column;gap:16px}h1{margin:0;font-size:24px;line-height:32px;font-weight:600}.fields{display:flex;flex-direction:column;gap:16px;max-width:600px}footer{display:flex;gap:8px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--w-border)}</style>