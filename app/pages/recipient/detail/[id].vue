<script lang="ts" setup>
import { hasStructuredAddress } from '~/composables/address/structuredAddress'
import { countryOptionLabel } from '~/data/countries'

// 定义页面元数据
definePageMeta({
});

let loading = ref(true);
let route = useRoute();
const itemId = route.params.id;

const itemData = ref<any>(null);

// 获取国际化方法
const { t, locale } = useI18n();

// 计算属性转换
const dataToPass = computed(() => ({
  current: t('nav.recipient'),
  list: [t('nav.warehouse'), t('nav.recipient')]
}));


const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/recipient/${itemId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;
        },
        onError: (error) => {
            if (error.status === 404) {
                
                showError({ statusCode: 404, message: t('action-results.not-found',{entity:t('common.entities.recipient'),identifier:itemId}) });
            }else {
                showToast(error.message, 'error')
            }
            
        },
        onFinally: () => {
            loading.value = false;
        }
    })
    return data;   
};

onMounted(async() => {
  await fetchData();
});

// 地址的显示：收件方名称已是标题，排版里只带公司（organization）行
const addressForView = computed(() => (itemData.value ? { ...itemData.value, name: null } : null));
const hasAddress = computed(() => !!itemData.value
  && (hasStructuredAddress(itemData.value) || !!String(itemData.value.address ?? '').trim()));


</script>

<template>
  <PageHeader :propData="dataToPass" />
  <div class="row d-flex justify-content-center mb-4" v-if="loading">
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">{{ t('common.status.loading') }}...</span>
    </div>
  </div>
  <div class="row" v-else>
    <div class="col-xl-12">
      <div class="card custom-card">
        <div class="card-body">
          <div class="row gx-5">
            <div class="col-xxl-9 col-xl-12">
              <div class="row gx-5">
                <div class="col-xl-8 mt-xxl-0 mt-3">
                  <div>
                    <p class="fs-18 fw-semibold mb-3">{{ itemData?.name}}</p>

                    <!-- 地址：结构化地址按国家排版（+ 拉丁转写），旧数据只有单行地址 -->
                    <div class="mb-4" v-if="hasAddress">
                      <p class="fs-15 fw-semibold mb-1">{{t('common.fields.address')}} :</p>
                      <StructuredAddressView class="text-muted" :address="addressForView" :legacy="itemData.address" with-names />
                    </div>
                    <div class="mb-4" v-if="itemData?.phone">
                      <p class="fs-15 fw-semibold mb-1">{{t('common.fields.phone')}} :</p>
                      <p class="text-muted mb-0">{{ itemData.phone }}
                      </p>
                    </div>
                    <div class="mb-4" v-if="itemData?.email">
                      <p class="fs-15 fw-semibold mb-1">{{t('common.fields.email')}} :</p>
                      <p class="text-muted mb-0">{{ itemData.email }}
                      </p>
                    </div>
                    <div class="mb-4" v-if="itemData?.contact">
                      <p class="fs-15 fw-semibold mb-1">{{t('common.fields.contact')}} :</p>
                      <p class="text-muted mb-0">{{ itemData.contact }}
                      </p>
                    </div>
                    <div class="mb-4" v-if="itemData?.country">
                      <p class="fs-15 fw-semibold mb-1">{{t('common.fields.country')}} :</p>
                      <p class="text-muted mb-0">{{ countryOptionLabel(itemData.country, locale) || itemData.country }}
                      </p>
                    </div>

                    <div class="table-responsive mb-4">
                      <table class="table table-bordered text-nowrap">
                        <tbody>
                          <tr>
                            <th scope="row" class="fw-semibold">
                              {{ t('common.users.creator') }}
                            </th>
                            <td>
                              {{ itemData?.creator.user_name }}
                            </td>
                          </tr>
                          <tr>
                            <th scope="row" class="fw-semibold">
                              {{ t('common.dates.created') }}
                            </th>
                            <td>
                              {{ $dayjs(itemData?.created_at,'YYYY-MM-DD HH:mm:ss') }}
                            </td>
                          </tr>
                          <tr>
                            <th scope="row" class="fw-semibold">
                              {{ t('common.dates.updated') }}
                            </th>
                            <td>
                              {{ $dayjs(itemData?.updated_at,'YYYY-MM-DD HH:mm:ss') }}
                            </td>
                          </tr>

                        </tbody>
                      </table>

                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="px-4 py-3 border-top border-block-start-dashed d-sm-flex justify-content-end">
          <NuxtLink :to="`/recipient/edit/${itemId}`" class="btn btn-primary mb-2">{{ t('recipient.operations.edit') }}
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->

</template>
<style>

</style>