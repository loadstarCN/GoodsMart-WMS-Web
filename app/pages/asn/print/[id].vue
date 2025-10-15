<script lang="ts" setup>

// 定义页面元数据
definePageMeta({
  layout: 'custom',
  middleware: ["auth"],
});

const staffStore = useStaffStore()


let loading = ref(true);
const route = useRoute();
const asnId = route.params.id;

const itemData = ref(null);
const itemSortingData = ref(null);
const { t } = useI18n();

const fetchData = async () => {
    loading.value = true;
    const data = await httpRequest(`/api/warehouse/asn/${asnId}`, {
        method: 'GET',
        params: route.query,
        onSuccess: (data) => {
          itemData.value = data;
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

const print = () => {
  window.print();
}
fetchData();
</script>
<template>

    <!-- Start::row-1 -->
    <div class="row">
    <div class="col-xl-12">
      <div class="card custom-card">
          <div class="card-header d-md-flex d-block">
              <div class="h5 mb-0 d-sm-flex d-bllock align-items-center">
                  <div class="avatar avatar-sm">
                      <img src="/images/brand-logos/toggle-logo.svg" alt="">
                  </div>
                  <div class="ms-sm-2 ms-0 mt-sm-0 mt-2">
                      <div class="h6 fw-semibold mb-0">#ASN-<span class="text-color">{{itemData?.id}}</span>
                      </div>
                  </div>
              </div>

              <div class="ms-auto mt-md-0 mt-2">
                <button class="btn btn-sm btn-primary me-1" @click="print" >{{t('button.print-to-pdf')}}<i class="ri-printer-line ms-1 align-middle"></i></button>
              </div>
          </div>
        </div>
      </div>
  </div>
  <!-- End::row-1 -->
  <!-- {{ orderDetailItem }} -->
  <div class="row"  id="printArea">
    <div class="tm_invoice tm_style1" id="tm_download_section">
        <div class="tm_invoice_in">
          <div class="tm_invoice_head tm_align_center tm_mb20">
            <div class="tm_invoice_left">
              <div class="tm_logo" v-if="staffStore?.staffInfo?.company?.logo"><img :src="staffStore?.staffInfo?.company?.logo" alt="Logo" style="width: 250px;"></div>
              <div class="tm_logo" v-else><img src="/images/brand-logos/desktop-logo.svg" alt="Logo" style="width: 250px;"></div>
            </div>
            <div class="tm_invoice_right tm_text_right">
              <div class="tm_primary_color tm_f50 tm_text_uppercase">{{t('asn.entity')}}
              </div>
            </div>
          </div>
          <div class="tm_invoice_info tm_mb20">
            <div class="tm_invoice_seperator tm_gray_bg"></div>
            <div class="tm_invoice_info_list">
              <p class="tm_invoice_number tm_m0">{{t('asn.fields.number')}}： <b class="tm_primary_color">#ASN-{{ itemData?.id }}</b></p>
              <p class="tm_invoice_date tm_m0">{{t('asn.fields.type')}}:  <b class="tm_primary_color">{{ t('asn.type.'+itemData?.asn_type) }}</b></p>

              <p class="tm_invoice_date tm_m0">{{t('common.fields.status')}}:  <b class="tm_primary_color">{{ t('common.status.'+itemData?.status.replace('_',"-")) }}</b></p>

              
            </div>
          </div>
          <div class="tm_mb30">
            <div class="row g-3">
            <div class="col-3">
              <p class="tm_mb2"><b class="tm_primary_color">{{t('common.entities.warehouse')}}</b></p>
              <p>{{itemData?.warehouse?.name}} (ID:{{itemData?.warehouse_id}})<br>
                <span v-if="itemData?.warehouse?.address" class="me-2">{{ t('common.fields.address') }} :{{itemData?.warehouse?.address}}</span><br>
                <span v-if="itemData?.warehouse?.zip_code">{{ t('common.fields.zip') }} :{{itemData?.warehouse?.zip_code}}</span><br>
                <span v-if="itemData?.warehouse?.phone">{{ t('common.fields.phone') }} :{{itemData?.warehouse?.phone}}</span>
              </p>
            </div>
            <div class="col-3">
              <p class="tm_mb2"><b class="tm_primary_color">{{t('common.entities.supplier')}}</b></p>
              <p>{{itemData?.supplier?.name}} (ID:{{itemData?.supplier_id}})<br>
                <span v-if="itemData?.supplier?.address" class="me-2">{{ t('common.fields.address') }} :{{itemData?.supplier?.address}}</span><br>
                <span v-if="itemData?.supplier?.zip_code">{{ t('common.fields.zip') }} :{{itemData?.supplier?.zip_code}}</span><br>
                <span v-if="itemData?.supplier?.phone">{{ t('common.fields.phone') }} :{{itemData?.supplier?.phone}}</span>
              </p>
            </div>
            <div class="col-3">
              <p class="tm_mb2"><b class="tm_primary_color">{{t('common.entities.carrier')}}</b></p>
              <p>{{itemData?.carrier?.name}} (ID:{{itemData?.carrier_id}})<br>
                <span v-if="itemData?.tracking_number">{{t('common.fields.tracking-number')}}: #{{itemData?.tracking_number}}</span><br>
                <span v-if="itemData?.supplier?.contact">{{ t('common.fields.contact') }} :{{itemData?.supplier?.contact}}</span><br>
                <span v-if="itemData?.supplier?.phone">{{ t('common.fields.phone') }} :{{itemData?.supplier?.phone}}</span>
              </p>
            </div>
            <div class="col-3 text-right">
              <Barcode :value="`ASN-${asnId}`" />
            </div>
            <div class="col-3">
              <p class="tm_mb2"><b class="tm_primary_color">{{t('asn.fields.expected-arrival-date')}}</b></p>
              <p>{{itemData?.expected_arrival_date}}</p>
            </div>
            <div class="col-3">
              <p class="tm_mb2"><b class="tm_primary_color">{{t('asn.fields.actual-date')}}</b></p>
              <p>{{itemData?.actual_arrival_date}}</p>
            </div>
            <div class="col-3" v-if="itemData?.status == 'pending' || itemData?.status == 'received'">
              <p class="tm_mb2"><b class="tm_primary_color">{{t('common.dates.created')}}</b></p>
              <p>{{ $dayjs(itemData?.created_at,'YYYY-MM-DD HH:mm:ss') }}</p>
            </div>
           
            <div class="col-3" v-if="itemData?.status == 'completed'">
              <p class="tm_mb2"><b class="tm_primary_color">{{t('common.dates.completed')}}</b></p>
              <p>{{ $dayjs(itemData?.completed_at,'YYYY-MM-DD HH:mm:ss') }}</p>
            </div>
            <div class="col-3" v-if="itemData?.status == 'closed'">
              <p class="tm_mb2"><b class="tm_primary_color">{{t('common.dates.closed')}}</b></p>
              <p>{{ $dayjs(itemData?.closed_at,'YYYY-MM-DD HH:mm:ss') }}</p>
            </div>
            <div class="col-3">
              <p class="tm_mb2"><b class="tm_primary_color">{{t('common.users.creator')}}</b></p>
              <p>{{itemData?.creator?.user_name}}<br>{{ $dayjs(itemData?.created_at,'YYYY-MM-DD HH:mm:ss') }}</p>
            </div>
          </div>
          </div>
          <div class="tm_table tm_style1 tm_mb30">
            <div class="tm_round_border">
              <div class="tm_table_responsive">
                <table>
                  <thead>
                    <tr>
                      <th class="tm_width_1 tm_semi_bold tm_primary_color tm_gray_bg">{{t('common.fields.id')}}</th>
                      <th class="tm_width_1 tm_semi_bold tm_primary_color tm_gray_bg">{{t('common.fields.code')}}</th>
                      <th class="tm_width_4 tm_semi_bold tm_primary_color tm_gray_bg">{{t('common.entities.goods')}}</th>
                      <th class="tm_width_1 tm_semi_bold tm_primary_color tm_gray_bg tm_text_right">{{t('common.quantities.expected')}}</th>
                      <th class="tm_width_1 tm_semi_bold tm_primary_color tm_gray_bg tm_text_right">{{t('common.quantities.actual')}}</th>
                      <th class="tm_width_1 tm_semi_bold tm_primary_color tm_gray_bg tm_text_right">{{t('common.quantities.sorted')}}</th>
                      <th class="tm_width_1 tm_semi_bold tm_primary_color tm_gray_bg tm_text_right">{{t('common.quantities.damaged')}}</th>
                      <th class="tm_width_1 tm_semi_bold tm_primary_color tm_gray_bg tm_text_right">{{t('common.units.weight')}}(kg)</th>
                      <th class="tm_width_1 tm_semi_bold tm_primary_color tm_gray_bg tm_text_right">{{t('common.units.volume')}}(m³)</th>
                      <th class="tm_width_3 tm_semi_bold tm_primary_color tm_gray_bg tm_text_right">{{t('common.fields.remark')}}</th>
                    </tr>
                  </thead>
                  <tbody>
                    
                    <tr v-for="(detail, index) in itemData?.details" >
                      <td class="tm_width_1">#{{ index+1 }}</td>
                      <td class="tm_width_1">{{detail.goods?.code}}</td>
                      <td class="tm_width_4">{{detail.goods?.name}}</td>
                      
                      <td class="tm_width_1 tm_text_right">{{detail.quantity}}</td>
                      <td class="tm_width_1 tm_text_right">{{detail.actual_quantity}}</td>
                      <td class="tm_width_1 tm_text_right">{{detail.sorted_quantity}}</td>
                      <td class="tm_width_1 tm_text_right">{{detail.damage_quantity}}</td>
                      <td class="tm_width_1 tm_text_right">{{detail.weight}}</td>
                      <td class="tm_width_1 tm_text_right">{{detail.volume}}</td>
                      <td class="tm_width_3 tm_text_right">{{detail.remark}}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div class="tm_invoice_footer mt-3">
              <div class="tm_left_footer">
              </div>
              <div class="tm_right_footer">
                <table>
                  <tbody>
                    <tr>
                      <td class="tm_width_3 tm_primary_color tm_border_none tm_bold">{{t('common.quantities.total-items')}}</td>
                      <td class="tm_width_3 tm_primary_color tm_text_right tm_border_none tm_bold">{{ itemData?.total_quantity }}</td>
                    </tr>
                    <tr>
                      <td class="tm_width_3 tm_primary_color tm_border_none tm_pt0">{{t('common.quantities.total-actual')}}</td>
                      <td class="tm_width_3 tm_primary_color tm_text_right tm_border_none tm_pt0">{{ itemData?.total_actual_quantity }}</td>
                    </tr>
                    <tr>
                      <td class="tm_width_3 tm_primary_color tm_border_none tm_pt0">{{t('common.quantities.total-damage')}}</td>
                      <td class="tm_width_3 tm_primary_color tm_text_right tm_border_none tm_pt0">{{ itemData?.total_damage_quantity }}</td>
                    </tr>
                    <tr class="tm_border_top tm_border_bottom">
                      <td class="tm_width_3 tm_border_top_0 tm_bold tm_f16 tm_primary_color">{{t('common.quantities.total-actual')}}</td>
                      <td class="tm_width_3 tm_border_top_0 tm_bold tm_f16 tm_primary_color tm_text_right">{{ itemData?.total_actual_quantity }}</td>
                    </tr>
                    <tr>
                      <td class="tm_width_3 tm_primary_color tm_border_none">{{t('common.quantities.total-weight')}}</td>
                      <td class="tm_width_3 tm_primary_color tm_text_right tm_border_none tm_pt0">{{ itemData?.total_weight }}</td>
                    </tr>
                    <tr>
                      <td class="tm_width_3 tm_primary_color tm_border_none tm_pt0">{{t('common.quantities.total-volume')}}</td>
                      <td class="tm_width_3 tm_primary_color tm_text_right tm_border_none tm_pt0">{{ itemData?.total_volume }}</td>
                    </tr>
                    
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="tm_padd_15_20 tm_round_border" v-if="itemData?.remark">
            {{ itemData?.remark }}
          </div><!-- .tm_note -->
          
        </div>
      </div>
  </div>
  <!-- End::row-2 -->

</template>


<style>
@import url("~/assets/css/invoice.css");

#printArea{
  margin: 20px;
  padding: 20px;
  font-size: 1rem;
  background-color: #fff;
}

@media print {
    body{
      background-color: #fff;
    }
     body * {
         visibility: hidden;
    }
     #printArea, #printArea * {
         visibility: visible;
    }
     #printArea {
         /* position: absolute;
         left: 0;
         top: 0; */
         margin:0;
         padding:0;
    }
     .no_print {
         display: none !important;
    }

    tr, td{
      page-break-inside: avoid;
    }

}
</style>
