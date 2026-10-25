<script lang="ts" setup>
import { currenciesOptions } from '~/data/selectOptions'
import { hasNonLatin } from '~/composables/customs/customsDocuments'
import { addressFieldLabel, ADDRESS_ERROR_FIELD } from '~/composables/address/structuredAddress'

// 定义页面元数据
definePageMeta({
})

// 获取国际化方法
const { t, te } = useI18n()
const { bizErrorMessage } = useBizError()

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.warehouse'),
  list: [t('nav.warehouse'), t('nav.warehouse')]
}))

const staffStore = useStaffStore()
const router = useRouter()
let route = useRoute();
const itemId = route.params.id;
let loading = ref(true);

const itemData = ref<Record<string, any>>({
  name: null,
  address: null,
  phone: null,
  zip_code: null,
  manager_id: null,
  manager: null,
  company_id: staffStore.staffInfo?.company_id,
  default_currency: staffStore.staffInfo?.company?.default_currency || 'JPY',
  // 出口资料：仓库作为发货地（Ship From）印在海外出货单证上
  address_en: null,
  country_code: null,
  contact_name_en: null,
  // 结构化地址（后端 doc/shipping-flow.md §6.2；address_en 是拉丁地址的单行写法）
  admin_area: null,
  locality: null,
  address_line1: null,
  address_line2: null,
  latin: null,
  // 时区（IANA 名；null = 服务器默认，后端 doc/timezone-utc.md §2）
  timezone: null,
})

/** 仓库的拉丁转写只有地址（联系人英文名另有 contact_name_en） */
const WAREHOUSE_LATIN_KEYS = ['address_line1', 'address_line2', 'locality', 'admin_area'] as const

const errors = ref<Record<string, any>>({
  name: null,
  timezone: null,
})
/** 服务器默认的时区：仓库没自己设时区时 = 详情接口的生效时区（timezone），否则不知道 */
const defaultZone = ref<string | null>(null)

// 配置化选项集合
const selectOptions = reactive({
  currencies: currenciesOptions,
})


// 处理供应商选择
const isLoading = ref(false);
const selectedStaff = ref<any>(null);
const staffSelectedOptions = ref<any[]>([]);

const fetchStaffData = async (name:string) => {
  if (!name) {
    return;
  }
  isLoading.value = true;
    const data = await httpRequest<PaginationData>('/api/warehouse/staff/', {
        method: 'GET',
        params: {all: true,user_name: name},
        onSuccess: async(data) => {
          staffSelectedOptions.value = data.items;
        },
        onError: (error) => {
            showToast(error.message, 'error')
        },
        onFinally: () => {
          isLoading.value = false;
        }
    })
    return data;   
};


watch(
  () => selectedStaff.value,  // 监听选中的供应商对象
  (newVal:any) => {
    if (newVal) {
      itemData.value.manager_id = newVal.id;  // 将对象 ID 同步到表单
      errors.value.manger = null; // 清除错误信息
    } else {
      itemData.value.manager_id = null;       // 清空选择时重置
    }
  },
  { immediate: true }  // 初始化时立即触发
);


/** 提交时去掉只读的 timezone_configured */
const withoutReadonlyZone = (data: Record<string, any>): Record<string, any> => {
  const { timezone_configured: _configured, ...rest } = data
  return rest
}

// ------------------ 提交保存 ----------------------
// 防重复提交：请求期间禁用按钮；成功后跳转离开，不再解锁
const submitting = ref(false)
const saveWarehouse = async () => {
  if (submitting.value) return
  errors.value = {
    name: !itemData.value.name ? t('common.validation.name-required', { entity: t('warehouse.entity') }) : null,
  }

  if (Object.values(errors.value).some(v => v)) return


  submitting.value = true
  await httpRequest(`/api/warehouse/warehouse/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    // 邮编两个名字都给（zip_code 即 postal_code；读回来的旧 postal_code 不能原样回传，两个不同后端 400 14019）
    // timezone_configured 是只读的；timezone 回传仓库自己设的（null = 服务器默认）
    body: { ...withoutReadonlyZone(itemData.value), postal_code: itemData.value.zip_code ?? null },
    onSuccess: async () => {
      showToast(t('action-results.success'), 'success')
      // 刷新员工信息与页头仓库下拉，并校验当前仓库
      await staffStore.refreshStaffInfo();
      await router.push('/warehouse/')          
    },
    onError: (error) => {
      // 时区不是合法的 IANA 名（400，field = timezone）
      if (error.field === 'timezone') {
        submitting.value = false
        errors.value.timezone = t('timezone.invalid')
        showToast(t('timezone.invalid'), 'error')
        return
      }
      submitting.value = false
      // 结构化地址的字段不对（14019，field 为 admin_area / latin.xxx 等）：指明是哪一项（同新建页）
      if (error.code === 14019 && ADDRESS_ERROR_FIELD.test(String(error.field || ''))) {
        showToast(t('address.errors.invalid-field', {
          field: addressFieldLabel(error.field, itemData.value.country_code, t, te), message: error.message || '—',
        }), 'error')
        return
      }
      // 14019 文本超长 / 14020 国家代码不合法 等业务码用三语文案
      showToast(bizErrorMessage(error), 'error')
    }
  })
}


// ------------------ 读取数据 ----------------------

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/warehouse/${itemId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          // 详情的 timezone 是生效时区（仓库设的 → 服务器默认）；表单编辑仓库自己设的 timezone_configured（null = 默认），
          // 不能把生效值原样回传（会把「用默认」变成固定时区）。旧后端两个都没有时按默认
          defaultZone.value = data?.timezone_configured ? null : (data?.timezone ?? null)
          itemData.value = { ...data, timezone: data?.timezone_configured ?? null };
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


onMounted(async() => {
  await fetchData();
  if (itemData.value.manager) {
    selectedStaff.value = itemData.value.manager;
    staffSelectedOptions.value = [itemData.value.manager]
  }
})


</script>

<template>
  <PageHeader :propData="dataToPass" />
  <!-- Start::row-1 -->
  <div class="row d-flex justify-content-center mb-4" v-if="loading">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
    </div>
  </div>
  <div class="row" v-else>
    <div class="col-xl-12">
      <div class="card custom-card">
        <div class="card-body add-products p-0">
          <div class="p-4">
            <div class="row gx-5">
              <div class="col-xxl-8 col-xl-12">
                <div class="card custom-card shadow-none mb-0 border-0">
                  <div class="card-body p-0">
                    <div class="row gy-3 mb-3">
                      <div class="col-xl-6">
                        <label for="warehouse-name" class="form-label">{{t('warehouse.fields.name')}} <abbr title="required" aria-hidden="true"
                            class="text-danger">*</abbr></label>
                        <input type="text" class="form-control" id="warehouse-name" :placeholder="t('common.placeholders.name')"
                          v-model="itemData.name">
                        <label for="warehouse-name" class="form-label mt-1 fs-12 op-5 text-muted mb-0">*{{t('common.tips.name')}}</label>
                        <div v-if="errors.name" class="invalid-feedback d-block">{{ errors.name }}</div>
                      </div>

                      <div class="col-xl-6">
                        <label for="warehouse-phone" class="form-label">{{t('common.fields.phone')}}</label>
                        <input type="text" class="form-control" id="warehouse-phone" :placeholder="t('common.placeholders.phone')"
                          v-model="itemData.phone">
                      </div>
                      <div class="col-xl-6">
                        <label for="product-currency" class="form-label">{{t('common.fields.currency')}}</label>
                        <VueMultiselect id="product-currency" :show-labels="false" :options="selectOptions.currencies"
                          :multiple="false" v-model="itemData.default_currency">
                        </VueMultiselect>
                      </div>
                      <div class="col-xl-6">
                        <label for="warehouse-timezone" class="form-label">{{ t('warehouse.fields.timezone') }}</label>
                        <TimeZoneSelect id="warehouse-timezone" v-model="itemData.timezone" :default-zone="defaultZone"
                          :invalid="!!errors.timezone" @update:model-value="errors.timezone = null" />
                        <div v-if="errors.timezone" class="invalid-feedback d-block">{{ errors.timezone }}</div>
                        <div class="form-text">{{ t('warehouse.tips.timezone') }}</div>
                      </div>

                      <!-- 结构化地址（国家、按国家排顺序的地址；拉丁转写 = 出口单证 / 国际面单的英文地址，address_en 跟着生成） -->
                      <div class="col-xl-12 mt-4">
                        <h6 class="fw-semibold mb-3"><i class="ri-map-pin-line me-1"></i>{{ t('address.title') }}</h6>
                        <StructuredAddressFields v-model="itemData" id-prefix="warehouse" country-key="country_code"
                          legacy-latin-key="address_en" :latin-keys="[...WAREHOUSE_LATIN_KEYS]" />
                      </div>

                      <div class="col-xl-12 mt-4">
                        <h6 class="fw-semibold mb-1"><i class="ri-earth-line me-1"></i>{{ t('warehouse.sections.export') }}</h6>
                        <p class="fs-12 text-muted mb-0">{{ t('warehouse.tips.export') }} {{ t('warehouse.tips.export-latin') }}</p>
                      </div>
                      <div class="col-xl-6">
                        <label for="warehouse-contact-name-en" class="form-label">{{ t('warehouse.fields.contact-name-en') }}</label>
                        <input type="text" class="form-control" id="warehouse-contact-name-en" maxlength="100"
                          :placeholder="t('warehouse.form.placeholders.contact-name-en')" v-model="itemData.contact_name_en">
                        <div class="form-text text-warning" v-if="hasNonLatin(itemData.contact_name_en)">{{ t('common.tips.non-latin') }}</div>
                      </div>


                    </div>
                    <div class="row gy-3">
                      <div class="col-xl-6">
                        <div class="mb-3">
                          <label class="form-label">{{t('common.users.manager')}}</label>
                          <div class="flex-nowrap input-group-custom">
                            <VueMultiselect :searchable="true" :show-labels="false" v-model="selectedStaff"
                              :options="staffSelectedOptions" :placeholder="t('common.search-placeholder')" :loading="isLoading"
                              :internal-search="false" label="user_name" track-by="id" :options-limit="100"
                              @search-change="fetchStaffData" />
                          </div>
                        </div>

                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
          <div class="px-4 py-3 border-top border-block-start-dashed d-sm-flex justify-content-end">
            <button class="btn btn-primary-light m-1" :disabled="submitting" @click="saveWarehouse">{{t('warehouse.operations.edit')}}<i
                class="ri-add-line ms-2"></i></button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->
</template>

<style scoped></style>
