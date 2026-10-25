<script lang="ts" setup>
/**
 * 发货单的收件地址（ship_to 快照，后端 doc/shipping-flow.md §6.2）输入，新界面版（设计稿 DnForm「本单使用单独的收件地址」）：
 * 国家 / 地区在最前，地址字段按国家排顺序、按国家换叫法（日本：邮编 → 都道府县 → 市区町村 → 町域 → 町名・番地 → 建筑名；
 * 其他：街道 → 补充 → 区 → 城市 → 州 → 邮编），然后公司 / 机构、收件人、电话、电子邮件；
 * 「拉丁转写」展开填国际面单用的拉丁字母写法（非拉丁字符提醒）。
 * - v-model：ship_to 对象 {country, postal_code, admin_area, locality, dependent_locality, address_line1, address_line2,
 *   organization, name, phone, email, latin}；字段直接改在这个对象上，要传 ref 里的对象。
 *   初值可用 shipToFromRecipient(收件人)，提交前用 cleanShipTo() 去掉空值（composables/address/structuredAddress.ts）
 * - 不发请求，也不管单行地址 shipping_address（由页面自己处理）
 * 放在 WFormGrid 里（12 栏）；窄屏单栏。
 */
import { hasNonLatin } from '~/composables/customs/customsDocuments'
import {
  JP_PREFECTURES,
  LATIN_KEYS,
  addressLabelKeys,
  addressPartOrder,
  hasLatinAddress,
  isBigEndianCountry,
  normalizePostalCode,
  type AddressPartKey,
  type LatinAddress,
} from '~/composables/address/structuredAddress'

const model = defineModel<Record<string, any>>({ required: true })

const props = withDefaults(defineProps<{
  idPrefix?: string
  editable?: boolean
  /** 国家的错误（如后端 14020） */
  countryError?: string | null
}>(), {
  idPrefix: 'dn-ship-to',
  editable: true,
  countryError: null,
})

const { t, te } = useI18n()

// 与后端 ship_to 的字段长度一致（address_format.FIELD_LIMITS）
const MAX: Record<string, number> = {
  postal_code: 10, admin_area: 100, locality: 100, dependent_locality: 100, address_line1: 255, address_line2: 255,
  organization: 255, name: 255, phone: 30, email: 255,
}
/** 选填的字段（设计稿 DnForm 标「选填」的）：町域、建筑名、公司、电子邮件 */
const OPTIONAL = ['dependent_locality', 'address_line2', 'organization', 'email']

const country = computed<string | null>({
  get: () => (model.value?.country ? String(model.value.country).toUpperCase() : null),
  set: (value: string | null) => {
    model.value.country = value
  },
})
const bigEndian = computed(() => isBigEndianCountry(country.value))
const parts = computed<AddressPartKey[]>(() => addressPartOrder(country.value))
/** 12 栏里各占几栏：短字段 4 栏；欧美写法的街道一行长些 */
const spanOf = (field: AddressPartKey): number => {
  if (field === 'address_line1') return bigEndian.value ? 4 : 8
  if (field === 'address_line2') return bigEndian.value ? 6 : 4
  return 4
}
/** 字段名称按国家换说法（去掉旧文案里的「（可选）」：选填由 WField 标） */
const stripOptional = (text: string) => text.replace(/\s*[（(](可选|选填|optional|任意)[)）]\s*$/i, '')
const fieldLabel = (field: string): string => {
  const key = addressLabelKeys(field, country.value).find((k: string) => te(k))
  return stripOptional(key ? t(key) : field)
}
const placeholderOf = (field: string): string => {
  const code = String(country.value || '').toUpperCase()
  const key = [`address.placeholders.${field}.${code}`, `address.placeholders.${field}.default`].find((k) => te(k))
  return key ? t(key) : ''
}
const valueOf = (key: string): string => String(model.value?.[key] ?? '')
const setValue = (key: string, value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  model.value[key] = text === '' ? null : text
}
const onPostalBlur = () => {
  const current = model.value?.postal_code
  if (current === null || current === undefined || current === '') return
  const next = normalizePostalCode(String(current), country.value)
  if (next !== current) model.value.postal_code = next || null
}
const prefectureList = computed(() => (country.value === 'JP' ? `${props.idPrefix}-prefectures` : undefined))

// ------------------ 拉丁转写 ----------------------
const latin = computed<LatinAddress>(() => (model.value?.latin && typeof model.value.latin === 'object' ? model.value.latin : {}))
const setLatin = (key: keyof LatinAddress, value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  const next: Record<string, any> = { ...latin.value, [key]: text === '' ? null : text }
  const empty = Object.values(next).every((v) => v === null || v === undefined || String(v).trim() === '')
  model.value.latin = empty ? null : next
}
const latinOpen = ref(hasLatinAddress(model.value as any))
watch(() => model.value?.latin, () => {
  if (hasLatinAddress(model.value as any)) latinOpen.value = true
})
const latinLabel = (key: keyof LatinAddress): string => {
  if (key === 'name') return t('dn.ship-to.name')
  if (key === 'organization') return stripOptional(t('address.fields.organization'))
  return fieldLabel(key)
}
</script>

<template>
  <WFormGrid class="w-shipto">
    <WField :label="t('common.fields.country')" :error="countryError" :span="4" :id="`${idPrefix}-country`">
      <CountryCombobox v-model="country" :disabled="!editable" :id="`${idPrefix}-country`" />
    </WField>
    <WField v-for="field in parts" :key="field" :id="`${idPrefix}-${field}`" :label="fieldLabel(field)" :span="spanOf(field)"
      :optional="OPTIONAL.includes(field)">
      <WInput :model-value="valueOf(field)" :maxlength="MAX[field]" :disabled="!editable" :placeholder="placeholderOf(field)"
        :inputmode="field === 'postal_code' && bigEndian ? 'numeric' : undefined"
        :list="field === 'admin_area' ? prefectureList : undefined"
        @update:model-value="setValue(field, $event)" @blur="field === 'postal_code' ? onPostalBlur() : undefined">
        <template v-if="field === 'postal_code' && country === 'JP'" #prefix>〒</template>
      </WInput>
    </WField>
    <datalist v-if="prefectureList" :id="prefectureList">
      <option v-for="p in JP_PREFECTURES" :key="p" :value="p" />
    </datalist>
    <WField :label="stripOptional(t('address.fields.organization'))" optional :span="6" :id="`${idPrefix}-organization`">
      <WInput :model-value="valueOf('organization')" :maxlength="MAX.organization" :disabled="!editable"
        @update:model-value="setValue('organization', $event)" />
    </WField>
    <div class="w-span-6 w-shipto__filler" aria-hidden="true" />
    <WField :label="t('dn.ship-to.name')" :span="4" :id="`${idPrefix}-name`">
      <WInput :model-value="valueOf('name')" :maxlength="MAX.name" :disabled="!editable" autocomplete="off"
        @update:model-value="setValue('name', $event)" />
    </WField>
    <WField :label="t('common.fields.phone')" :span="4" :id="`${idPrefix}-phone`">
      <WInput :model-value="valueOf('phone')" :maxlength="MAX.phone" :disabled="!editable" inputmode="tel" autocomplete="off"
        @update:model-value="setValue('phone', $event)" />
    </WField>
    <WField :label="t('common.fields.email')" optional :span="4" :id="`${idPrefix}-email`">
      <WInput :model-value="valueOf('email')" type="email" :maxlength="MAX.email" :disabled="!editable" autocomplete="off"
        @update:model-value="setValue('email', $event)" />
    </WField>

    <!-- 拉丁转写（国际面单用） -->
    <div class="w-span-12 w-shipto__latin">
      <button type="button" class="w-shipto__toggle" :aria-expanded="latinOpen" @click="latinOpen = !latinOpen">
        {{ latinOpen ? '−' : '+' }} {{ t('dn.ship-to.latin') }}
      </button>
      <WHelp :text="t('address.latin.hint')" />
    </div>
    <template v-if="latinOpen">
      <WField v-for="key in LATIN_KEYS" :key="`latin-${key}`" :id="`${idPrefix}-latin-${key}`" :label="latinLabel(key)" optional
        :span="key === 'address_line1' || key === 'address_line2' ? 6 : 4"
        :hint="hasNonLatin(latin[key]) ? t('address.latin.non-latin') : undefined">
        <WInput :model-value="latin[key] ?? ''" :maxlength="MAX[key] || 255" :disabled="!editable"
          @update:model-value="setLatin(key, $event)" />
      </WField>
    </template>
  </WFormGrid>
</template>

<style scoped>
.w-shipto__filler { min-height: 0; }
.w-shipto__latin { display: flex; align-items: center; gap: 6px; }
.w-shipto__toggle {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--w-link);
  font: inherit;
  font-family: var(--w-font);
  font-size: var(--w-fs-13);
  font-weight: var(--w-fw-medium);
  cursor: pointer;
}
.w-shipto__toggle:hover { color: var(--w-link-hover); }
.w-shipto__toggle:focus-visible { outline: none; border-radius: 2px; box-shadow: var(--w-focus-ring); }
@media (max-width: 1023.98px) {
  .w-shipto__filler { display: none; }
}
</style>
