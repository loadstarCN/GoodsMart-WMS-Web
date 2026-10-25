<script lang="ts" setup>
import { staffRolesOptions } from '~/data/selectOptions'

// 定义页面元数据
definePageMeta({
})


// 获取国际化方法
const { t } = useI18n()
// 角色存代码（company_admin 等），显示译名
const { roleLabel } = useOptionLabel()

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.staff'),
  list: [t('nav.warehouse'), t('nav.staff')]
}))

const staffStore = useStaffStore()
const warehouseStore = useWarehouseStore()
const router = useRouter()

const itemData = ref<Record<string, any>>({
  user_name: null,
  email: null,
  avatar: null,
  phone: null,
  position: null,
  employee_number: null,
  hire_date: null,
  company_id: staffStore.staffInfo?.company_id,
  department_id: null,
  warehouses: [],
  roles: []  
})

const errors = ref<Record<string, any>>({
  user_name: null,
  password: null,
  email: null,
  roles: null
})


// 配置化选项集合
const selectOptions = reactive({
  roles: staffRolesOptions,
  warehouses: [] as any[],
  departments: [] as any[]
})





// ------------------ 提交保存 ----------------------
const { bizErrorMessage } = useBizError()
// 防重复提交：请求期间禁用按钮；成功后跳转离开，不再解锁
const submitting = ref(false)
const addStaff = async () => {
  if (submitting.value) return
  errors.value = {
    user_name: !itemData.value.user_name ? t('common.validation.name-required', { entity: t('staff.entity') }) : null,
    password:(() => {
      const password = itemData.value.password;
      // 填了密码才校验：与后端的密码规则一致（8–16 位，含大小写字母、数字和特殊符号）
      if (password && !isValidPassword(password)) {
        return t('common.validation.password-policy', passwordPolicyParams());
      }
      return null;
    })(),
    email: (() => {
      const email = itemData.value.email;
      if (!email) return t('common.validation.email-required');
      // 仅当输入非空时进行格式验证
      if (email && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        return t('common.validation.email-format');
      }
      return null;
    })(),
    roles: itemData.value.roles.length === 0 ?  t('common.validation.role-min-count') : null,
  }

  if (Object.values(errors.value).some(v => v)) return

  // 检查仓库是否选择
  itemData.value.warehouse_ids = itemData.value.warehouses.map((w: any) => w.id)

  submitting.value = true
  await httpRequest('/api/warehouse/staff/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: itemData.value,
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success')
      await router.push('/staff/')          
    },
    onError: (error) => {
      submitting.value = false
      showToast(bizErrorMessage(error), 'error')
    }
  })
}

// 密码框默认遮住；点「生成」后明文显示生成的密码，方便告知员工
const passwordVisible = ref(false)
const generatePassword = () => {
  // 生成符合密码规则的随机密码（加密安全的随机数；规则见 utils/passwordPolicy.ts，与后端 10015 一致）
  itemData.value.password = generatePolicyPassword();
  passwordVisible.value = true;
}


// 处理收件人选择
const selectedDepartment = ref<any>(null);

const fetchDepartmentData = async () => {
    const data = await httpRequest<PaginationData>('/api/warehouse/department/', {
        method: 'GET',
        params: {all: true,company_id: staffStore.staffInfo?.company_id},
        onSuccess: async(data) => {
          selectOptions.departments = data.items;
        },
        onError: (error) => {
            showToast(error.message, 'error')
        }
    })
    return data;   
};


watch(
  () => selectedDepartment.value,  // 监听选中的收货人对象
  (newVal:any) => {
    if (newVal) {
      itemData.value.department_id = newVal.id;  // 更新部门ID
    } else {
      itemData.value.department_id = null;       // 清空选择时重置
    }
  },
  { immediate: true }  // 初始化时立即触发
);

onMounted(async () => {

  // 获取仓库列表
  
    await warehouseStore.fetchWarehouses();
    selectOptions.warehouses = warehouseStore.warehouses;
  // 获取部门列表
  await fetchDepartmentData();
    
    
})

</script>

<template>
  <PageHeader :propData="dataToPass" />
  <!-- Start::row-1 -->
  <div class="row">
    <div class="col-xl-12">
      <div class="card custom-card">
        <div class="card-body add-products p-0">
          <div class="p-4">
            <div class="row gx-5">
              <div class="col-xxl-6 col-xl-12">
                <div class="card custom-card shadow-none mb-0 border-0">
                  <div class="card-body p-0">
                    <div class="row gy-3">
                      <div class="col-xl-12">
                        <label for="staff-name" class="form-label">{{t('staff.fields.name')}} <abbr title="required" aria-hidden="true"
                            class="text-danger">*</abbr></label>
                        <input type="text" class="form-control" id="staff-name" :placeholder="t('common.placeholders.name')"
                          v-model="itemData.user_name">
                        <label for="staff-name" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{t('common.tips.name')}}</label>
                        <div v-if="errors.user_name" class="invalid-feedback d-block">{{ errors.user_name }}</div>
                      </div>
                      <div class="col-xl-12">
                        <label for="staff-password" class="form-label">{{t('common.fields.password')}}</label>

                        <SecretInput class="mb-3" id="staff-password" v-model="itemData.password" v-model:visible="passwordVisible"
                          :placeholder="t('common.placeholders.password')" autocomplete="new-password">
                          <template #append>
                            <button class="btn btn-primary" type="button" @click="generatePassword()">{{t('button.generate')}}</button>
                          </template>
                        </SecretInput>
                        <div v-if="errors.password" class="invalid-feedback d-block">{{ errors.password }}</div>
                      </div>
                      <div class="col-xl-12">
                        <label for="staff-rolese" class="form-label">{{t('staff.fields.roles')}} <abbr title="required" aria-hidden="true"
                            class="text-danger">*</abbr></label>
                        <VueMultiselect id="staff-roles" :show-labels="false" :options="selectOptions.roles"
                          :custom-label="roleLabel" :multiple="true" v-model="itemData.roles">
                        </VueMultiselect>
                        <div v-if="errors.roles" class="invalid-feedback d-block">{{ errors.roles
                          }}</div>
                      </div>                     

                      <div class="col-xl-6">
                        <label for="staff-email" class="form-label">{{t('common.fields.email')}} <abbr title="required" aria-hidden="true"
                            class="text-danger">*</abbr></label>
                        <input type="text" class="form-control" id="staff-email" v-model="itemData.email"
                          :placeholder="t('common.placeholders.email')">
                        <div v-if="errors.email" class="invalid-feedback d-block">{{ errors.email }}</div>
                      </div>

                      <div class="col-xl-6">
                        <label for="staff-phone" class="form-label">{{t('common.fields.phone')}}</label>
                        <input type="text" class="form-control" id="staff-phone" v-model="itemData.phone"
                          :placeholder="t('common.placeholders.phone')">
                      </div>
                      <div class="col-xl-6">
                        <label for="staff-position" class="form-label">{{t('staff.fields.position')}}</label>
                        <input type="text" class="form-control" id="staff-position" v-model="itemData.position" :placeholder="t('staff.form.placeholders.position')">
                      </div>
                      <div class="col-xl-6">
                        <label for="staff-employee_number" class="form-label">{{t('staff.fields.employee-number')}}</label>
                        <input type="text" class="form-control" id="staff-employee_number"
                          v-model="itemData.employee_number" :placeholder="t('staff.form.placeholders.employee-number')">
                      </div>
                      <div class="col-xl-6">
                        <label for="staff-hire_date" class="form-label">{{t('staff.fields.hire-date')}}</label>
                        <input type="date" class="form-control" id="staff-hire_date" v-model="itemData.hire_date"
                          placeholder="Hire Date">
                      </div>
                      <div class="col-xl-12">
                        <label class="form-label">{{t('common.entities.warehouse')}}</label>
                        <div class="flex-nowrap input-group-custom">
                          <VueMultiselect id="dn-warehouse" :show-labels="false" :options="selectOptions.warehouses"
                            :multiple="true" v-model="itemData.warehouses" label="name" track-by="id"></VueMultiselect>
                        </div>
                      </div>
                      <div class="col-xl-6">
                        <label for="staff-department_id" class="form-label">{{t('common.entities.department')}}</label>
                        <VueMultiselect id="staff-department_id" :show-labels="false"
                          :options="selectOptions.departments" v-model="selectedDepartment" label="name"
                          track-by="id"></VueMultiselect>
                        <div v-if="errors.department_id" class="invalid-feedback d-block">{{ errors.department_id
                          }}</div>
                      </div>
                      <div class="col-xl-12">
                        <label class="form-label d-block">{{t('staff.fields.avater')}}</label>
                        <ImageUploader v-model="itemData.avatar"
                          upload-url="/api/warehouse/staff/image/upload"
                          shape="circle" :size="100" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
          <div class="px-4 py-3 border-top border-block-start-dashed d-sm-flex justify-content-end">
            <button class="btn btn-primary-light m-1" :disabled="submitting" @click="addStaff">{{t('staff.operations.add')}}<i
                class="ri-add-line ms-2"></i></button>

          </div>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->
</template>

<style scoped></style>
