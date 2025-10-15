<script lang="ts" setup>
import { staffRolesOptions } from '~/data/selectOptions'

// 定义页面元数据
definePageMeta({
  middleware: ["auth"]
})


// 获取国际化方法
const { t } = useI18n()

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.staff'),
  list: [t('nav.warehouse'), t('nav.staff')]
}))

const staffStore = useStaffStore()
const warehouseStore = useWarehouseStore()
const router = useRouter()
let route = useRoute();
const itemId = route.params.id;
let loading = ref(true);

const itemData = ref({
  user_name: null,
  email: null,
  avatar: null,
  phone: null,
  position: null,
  employee_number: null,
  hire_date: null,
  company_id: staffStore.staffInfo?.company_id,
  department_id: null,
  department: null,
  warehouses: [],
  roles: []  
})

const errors = ref({
  user_name: null,
  password: null,
  email: null,
  roles: null
})


// 配置化选项集合
const selectOptions = reactive({
  roles: staffRolesOptions,
  warehouses:[],
  departments: []
})



// ------------------ 图片上传功能 Start----------------------
// 组合式 FilePond 配置
import vueFilePond from 'vue-filepond'
import 'filepond/dist/filepond.min.css'
import 'filepond-plugin-image-preview/dist/filepond-plugin-image-preview.min.css'
import FilePondPluginImagePreview from 'filepond-plugin-image-preview'
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type'

// 组件注册
const FilePond = vueFilePond(
  FilePondPluginImagePreview,
  FilePondPluginFileValidateType
)
const pond = ref(null)
// 文件上传配置
const myFiles = ref([]) // 修正初始化方式为数组
const acceptedFileTypes = ref(['image/png', 'image/jpeg']) // 声明为响应式数组

const serverConfig = {
  // 优化load方法处理本地文件
  load: (source, load, error, progress, abort, headers) => {
    if (!source || source === '[]') {
      error(t('upload.upload-image-no-file'))
      abort()
      return () => {}
    }

    fetch(source)
      .then(res => res.blob())
      .then(load)
      .catch(error)
    return () => abort()
  },
  process: async (fieldName, file, metadata, load, error, progress, abort) => {
    if (!acceptedFileTypes.value.includes(file.type)) {
      error(t('upload.upload-image-type-error'))
      return abort()
    }

    const controller = new AbortController()
    const formData = new FormData()
    formData.append('file', file, file.name)
    
    await httpRequest('/api/warehouse/staff/image/upload', {
      method: 'POST',
      body: formData,
      onSuccess: async (data) => {
        load(data.file_url)   
      },
      onError: (error) => {
        error(err.message || t('upload.upload-image-failed'))
        abort()
      }
    })
    
    return { abort: () => controller.abort() }
  }
  
}

// 添加文件处理完成监听
const handleProcessFile = (error, file) => {
  
  if (!error) {   
    // 更新数据模型 
    itemData.value.avatar = file.serverId
    
  }
}

const handleRemoveFile = (error, file) => {
  if (!error) {
    // 更新数据模型
    itemData.value.avatar = null
    
  }
}


// ------------------ 提交保存 ----------------------
const saveStaff = async () => {
  var password_min_length = 6;
  errors.value = {
    user_name: !itemData.value.user_name ? t('common.validation.name-required') : null,
    password:(() => {
      const password = itemData.value.password;
      // if (!password) return t('common.validation.password-required');
      // 仅当输入非空时进行长度验证
      if (password && password.length < password_min_length) {
        return t('common.validation.name-required', { min: password_min_length });
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
  itemData.value.warehouse_ids = itemData.value.warehouses.map(w => w.id)

  await httpRequest(`/api/warehouse/staff/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: itemData.value,
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success')
      await router.push('/staff/')          
    },
    onError: (error) => {
      showToast(t('action-results.failed'), 'error')
    }
  })
}

const generatePassword = () => {
  const length = 8;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  itemData.value.password = password;
}


// 处理收件人选择
const selectedDepartment = ref(null);

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
      itemData.value.department = newVal; // 同步部门对象
    } else {
      itemData.value.department_id = null;       // 清空选择时重置
      itemData.value.department = null; // 清空部门对象
    }
  },
  { immediate: true }  // 初始化时立即触发
);


// ------------------ 读取数据 ----------------------

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/staff/${itemId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;   
          // 将图片数据转换为 FilePond 需要的格式
          if(itemData.value.avatar) {
            myFiles.value = [{
              source: itemData.value.avatar,
              options: { type: 'local' }
            }]
          } else {
            myFiles.value = []
          }           
        },
        onError: (error) => {
            showToast(error.message, 'error')
        },
        onFinally: () => {
            loading.value = false;
        }
    })
    return data;   
};



onMounted(async () => {
  await fetchData();

  selectedDepartment.value = itemData.value.department;

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

                        <div class="input-group mb-3">
                          <input type="text" class="form-control" id="staff-password" :placeholder="t('common.placeholders.password')"
                            v-model="itemData.password">
                          <button class="btn btn-primary" type="button" id="button-addon2" @click="generatePassword()">{{t('button.generate')}}</button>
                        </div>
                        <div v-if="errors.password" class="invalid-feedback d-block">{{ errors.password }}</div>
                      </div>
                      <div class="col-xl-12">
                        <label for="staff-rolese" class="form-label">{{t('staff.fields.roles')}} <abbr title="required" aria-hidden="true"
                            class="text-danger">*</abbr></label>
                        <VueMultiselect id="staff-roles" :show-labels="false" :options="selectOptions.roles"
                          :multiple="true" v-model="itemData.roles">
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
                      <div class="col-xl-12 product-documents-container">
                        <p class="fw-semibold mb-2 fs-14">{{t('staff.fields.avater')}} :</p>
                        <file-pond name="image" ref="pond"
                          :label-idle="t('upload.description')"
                          allow-multiple="false" max-files="1" :files="myFiles" :accepted-file-types="acceptedFileTypes"
                          :allow-file-type-validation="true" :instant-upload="false" :server="serverConfig"
                          @init="(instance) => pond = instance" @processfile="handleProcessFile"
                          @removefile="handleRemoveFile" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
          <div class="px-4 py-3 border-top border-block-start-dashed d-sm-flex justify-content-end">
            <button class="btn btn-primary-light m-1" @click="saveStaff">{{t('staff.operations.edit')}}<i
                class="bi bi-plus-lg ms-2"></i></button>

          </div>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->
</template>

<style scoped></style>
