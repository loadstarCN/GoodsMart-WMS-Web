<script lang="ts" setup>
/**
 * 出库单的收件地址（ship_to 快照，后端 doc/shipping-flow.md §6.2）输入：收件人姓名 / 电话 / 邮箱，
 * 加 StructuredAddressFields（国家、公司、按国家排顺序的地址、排版预览、拉丁转写）。
 * - v-model：ship_to 对象 {country, postal_code, admin_area, locality, dependent_locality, address_line1, address_line2,
 *   organization, name, phone, email, latin}；字段直接改在这个对象上（与 StructuredAddressFields 相同），
 *   要传 ref 里的对象。初值可用 shipToFromRecipient(收件人)，提交前用 cleanShipTo() 去掉空值
 *   （composables/address/structuredAddress.ts）
 * - 不发请求，也不管单行地址 shipping_address（由页面自己处理）
 */
const model = defineModel<Record<string, any>>({ required: true })

withDefaults(defineProps<{
  idPrefix?: string
  editable?: boolean
  /** 国家的错误（如后端 14020） */
  countryError?: string | null
}>(), {
  idPrefix: 'dn-ship-to',
  editable: true,
  countryError: null,
})

const { t } = useI18n()

// 与后端 ship_to 的字段长度一致（address_format.FIELD_LIMITS）
const MAX = { name: 255, phone: 30, email: 255 }

const valueOf = (key: string): string => String(model.value?.[key] ?? '')
const setValue = (key: string, value: string) => {
  model.value[key] = value === '' ? null : value
}
</script>

<template>
  <div class="dn-ship-to">
    <div class="row gy-3 mb-3">
      <div class="col-xl-4">
        <label :for="`${idPrefix}-name`" class="form-label">{{ t('dn.ship-to.name') }}</label>
        <input type="text" class="form-control" :id="`${idPrefix}-name`" :maxlength="MAX.name" :disabled="!editable"
          :placeholder="t('common.placeholders.contact')" :value="valueOf('name')"
          @input="setValue('name', ($event.target as HTMLInputElement).value)">
      </div>
      <div class="col-xl-4">
        <label :for="`${idPrefix}-phone`" class="form-label">{{ t('common.fields.phone') }}</label>
        <input type="text" class="form-control" :id="`${idPrefix}-phone`" :maxlength="MAX.phone" :disabled="!editable"
          :placeholder="t('common.placeholders.phone')" :value="valueOf('phone')"
          @input="setValue('phone', ($event.target as HTMLInputElement).value)">
      </div>
      <div class="col-xl-4">
        <label :for="`${idPrefix}-email`" class="form-label">{{ t('common.fields.email') }}</label>
        <input type="email" class="form-control" :id="`${idPrefix}-email`" :maxlength="MAX.email" :disabled="!editable"
          :placeholder="t('common.placeholders.email')" :value="valueOf('email')"
          @input="setValue('email', ($event.target as HTMLInputElement).value)">
      </div>
    </div>
    <!-- 国家、公司、地址本体、预览、拉丁转写；单行地址不在这里（legacy-key = null） -->
    <StructuredAddressFields v-model="model" :id-prefix="idPrefix" postal-key="postal_code" :legacy-key="null"
      :country-error="countryError" :editable="editable" with-organization with-dependent-locality />
  </div>
</template>
