<script lang="ts" setup>
import { countryOptionLabel } from '~/data/countries'
import { hasStructuredAddress } from '~/composables/address/structuredAddress'

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
  current: t('nav.warehouse'),
  list: [t('nav.warehouse'), t('nav.warehouse')]
}));


const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/warehouse/${itemId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;
        },
        onError: (error) => {
            if (error.status === 404) {
                
                showError({ statusCode: 404, message: t('action-results.not-found',{entity:t('common.entities.warehouse'),identifier:itemId}) });
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

// 有结构化地址、单行地址或英文地址时显示地址一栏
const hasAddress = computed(() => !!itemData.value && (hasStructuredAddress(itemData.value)
  || !!String(itemData.value.address ?? '').trim() || !!String(itemData.value.address_en ?? '').trim()));

/** 仓库的生效时区（Asia/Tokyo (UTC+09:00)）；仓库没自己设时标「服务器默认」；旧后端没给时「—」 */
const zoneText = (w: any): string => {
  if (!isValidTimeZone(w?.timezone)) return '—'
  const text = timeZoneDescription(w.timezone)
  return w.timezone_configured ? text : t('timezone.effective-default', { zone: text })
}


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

                    <!-- 地址：结构化地址按国家排版（+ 拉丁转写 / 英文单行地址 address_en），旧数据只有单行地址 -->
                    <div class="mb-4" v-if="hasAddress">
                      <p class="fs-15 fw-semibold mb-1">{{t('common.fields.address')}} :</p>
                      <StructuredAddressView class="text-muted" :address="itemData" country-key="country_code"
                        :legacy="itemData.address" :legacy-latin="itemData.address_en" />
                    </div>
                    <div class="mb-4" v-if="itemData?.country_code || itemData?.contact_name_en">
                      <p class="fs-15 fw-semibold mb-1">{{ t('warehouse.sections.export') }} :</p>
                      <p class="text-muted mb-0" v-if="itemData.country_code">{{ countryOptionLabel(itemData.country_code, locale) }}</p>
                      <p class="text-muted mb-0" v-if="itemData.contact_name_en">{{ itemData.contact_name_en }}</p>
                    </div>
                    <div class="mb-4" v-if="itemData?.phone">
                      <p class="fs-15 fw-semibold mb-1">{{t('common.fields.phone')}} :</p>
                      <p class="text-muted mb-0">{{ itemData.phone }}
                      </p>
                    </div>
                    <div class="mb-4" v-if="itemData?.timezone">
                      <p class="fs-15 fw-semibold mb-1">{{ t('warehouse.fields.timezone') }} :</p>
                      <p class="text-muted mb-0">{{ zoneText(itemData) }} <TimeZoneBadge :zone="itemData.timezone" /></p>
                    </div>
                    <div class="mb-4" v-if="itemData?.default_currency">
                      <p class="fs-15 fw-semibold mb-1">{{t('common.fields.currency')}} :</p>
                      <p class="text-muted mb-0">{{ itemData.default_currency }}
                      </p>
                    </div>
                    <div class="mb-4" v-if="itemData?.manager">
                      <p class="fs-15 fw-semibold mb-1">{{t('common.users.manager')}} :</p>
                      <p class="text-muted mb-0">{{ itemData.manager?.user_name }}
                      </p>
                    </div>

                    <div class="table-responsive mb-4">
                      <table class="table table-bordered text-nowrap">
                        <tbody>
                          <tr>
                            <th scope="row" class="fw-semibold">
                              {{t('common.users.creator')}}
                            </th>
                            <td>
                              {{ itemData?.creator.user_name }}
                            </td>
                          </tr>
                          <tr>
                            <th scope="row" class="fw-semibold">
                              {{t('common.dates.created')}}
                            </th>
                            <td>
                              {{ $dayjs(itemData?.created_at,'YYYY-MM-DD HH:mm:ss', itemData) }}
                            </td>
                          </tr>
                          <tr>
                            <th scope="row" class="fw-semibold">
                              {{t('common.dates.updated')}}
                            </th>
                            <td>
                              {{ $dayjs(itemData?.updated_at,'YYYY-MM-DD HH:mm:ss', itemData) }}
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
          <NuxtLink :to="`/warehouse/edit/${itemId}`" class="btn btn-primary mb-2">{{t('warehouse.operations.edit')}}
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
  <!--End::row-1 -->

</template>
<style>

</style>