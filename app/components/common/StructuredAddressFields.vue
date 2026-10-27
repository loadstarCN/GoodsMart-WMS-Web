<script lang="ts" setup>
/**
 * 结构化地址的输入（收件人新建 / 编辑、仓库编辑；字段见 composables/address/structuredAddress.ts）。
 * - 国家下拉（CountrySelect）在最前；输入框按国家排顺序：日本 〒邮编 → 都道府県 → 市区町村 → 番地 → 建物，
 *   其他国家 街道 → 补充 → 城市 → 州 / 省 → 邮编；字段名称按国家换说法（都道府県 / State / Province / Postcode……）
 * - 下面是按国家排版的预览，以及旧的单行地址（legacyKey，如 address）：单行地址空着、或与之前的排版一致时跟着结构化字段
 *   自动更新；手工改过的不覆盖，可以一键「用上面的地址」。legacyKey 传 null 时不显示单行地址（页面自己管，如 DN 的收件地址）
 * - 可展开的「拉丁转写（国际面单用）」：latin 里的字段；legacyLatinKey（仓库的 address_en）同样跟着自动更新
 * 直接改 v-model 对象上的字段（countryKey / postalKey 可换名：仓库是 country_code，收件人和仓库的邮编都是 zip_code）。
 */
import { hasNonLatin } from '~/composables/customs/customsDocuments'
import { countryName } from '~/data/countries'
import {
  JP_PREFECTURES,
  LATIN_KEYS,
  addressLabelKeys,
  addressPartOrder,
  formatAddressLines,
  formatAddressOneLine,
  hasLatinAddress,
  hasStructuredAddress,
  normalizePostalCode,
  type AddressPartKey,
  type LatinAddress,
  type StructuredAddress,
} from '~/composables/address/structuredAddress'

const model = defineModel<Record<string, any>>({ required: true })

const props = withDefaults(defineProps<{
  idPrefix: string
  countryKey?: string
  postalKey?: string
  /** 旧的单行地址字段（本地文字）；null = 不显示单行地址（由页面自己管，如 DN 的 shipping_address） */
  legacyKey?: string | null
  /** 旧的单行拉丁地址字段（仓库的 address_en）；不传不显示 */
  legacyLatinKey?: string | null
  countryRequired?: boolean
  countryError?: string | null
  withOrganization?: boolean
  withDependentLocality?: boolean
  /** 拉丁转写要填的字段（仓库没有 name / organization） */
  latinKeys?: (keyof LatinAddress)[]
  editable?: boolean
}>(), {
  countryKey: 'country',
  postalKey: 'zip_code',
  legacyKey: 'address',
  legacyLatinKey: null,
  countryRequired: false,
  countryError: null,
  withOrganization: false,
  withDependentLocality: false,
  latinKeys: () => [...LATIN_KEYS],
  editable: true,
})

const { t, te, locale } = useI18n()

const country = computed<string | null>({
  get: () => (model.value?.[props.countryKey] ? String(model.value[props.countryKey]).toUpperCase() : null),
  set: (value: string | null) => {
    model.value[props.countryKey] = value
  },
})

/**
 * 统一成结构化地址（预览用）。收件人的资料里 name 是收货方名称、contact 是联系人：与后端 recipient_address 一致，
 * 面单上的姓名 = 联系人（没有用名称），公司 = organization（没有且联系人不同于名称时用名称）
 */
const previewName = computed(() => String(model.value?.contact || '').trim() || model.value?.name)
const previewOrganization = computed(() => {
  const own = String(model.value?.organization || '').trim()
  if (own) return own
  const contact = String(model.value?.contact || '').trim()
  const name = String(model.value?.name || '').trim()
  return contact && name && contact !== name ? name : null
})
const address = computed<StructuredAddress>(() => ({
  country: country.value,
  postal_code: model.value?.[props.postalKey] ?? model.value?.postal_code ?? null,
  admin_area: model.value?.admin_area,
  locality: model.value?.locality,
  dependent_locality: props.withDependentLocality ? model.value?.dependent_locality : null,
  address_line1: model.value?.address_line1,
  address_line2: model.value?.address_line2,
  organization: previewOrganization.value,
  name: previewName.value,
  latin: model.value?.latin && typeof model.value.latin === 'object' ? model.value.latin : null,
}))

// ------------------ 字段 ----------------------
const parts = computed<AddressPartKey[]>(() => addressPartOrder(country.value)
  .filter((k: AddressPartKey) => k !== 'dependent_locality' || props.withDependentLocality))
// 与后端的列宽一致（收件人 / 仓库的 zip_code 是 10 位，单行地址 address 255、address_en 500）
const MAX: Record<string, number> = {
  postal_code: 10, admin_area: 100, locality: 100, dependent_locality: 100, address_line1: 255, address_line2: 255,
  organization: 255, name: 255,
}
const fieldLabel = (field: string): string => {
  const key = addressLabelKeys(field, country.value).find((k: string) => te(k))
  return key ? t(key).replace(/（可选）|\(optional\)|（任意）/gi, '').replace(/，可选(?=）)/g, '') : field
}
const placeholderOf = (field: string): string => {
  const code = String(country.value || '').toUpperCase()
  const key = [`address.placeholders.${field}.${code}`, `address.placeholders.${field}.default`].find((k) => te(k))
  return key ? t(key) : ''
}
const modelKeyOf = (field: AddressPartKey): string => (field === 'postal_code' ? props.postalKey : field)
const valueOf = (field: AddressPartKey): string => String(model.value?.[modelKeyOf(field)] ?? '')
const setValue = (field: string, value: string) => {
  model.value[field] = value === '' ? null : value
}
const onPostalBlur = () => {
  const current = model.value?.[props.postalKey]
  if (current === null || current === undefined || current === '') return
  const next = normalizePostalCode(String(current), country.value)
  if (next !== current) model.value[props.postalKey] = next || null
}
const isJapan = computed(() => country.value === 'JP')

// ------------------ 拉丁转写 ----------------------
const latin = computed<LatinAddress>(() => (model.value?.latin && typeof model.value.latin === 'object' ? model.value.latin : {}))
const setLatin = (key: keyof LatinAddress, value: string) => {
  const next: Record<string, any> = { ...latin.value, [key]: value === '' ? null : value }
  const empty = Object.values(next).every((v) => v === null || v === undefined || String(v).trim() === '')
  model.value.latin = empty ? null : next
}
const latinOpen = ref(hasLatinAddress(address.value) || (!!props.legacyLatinKey && !!model.value?.[props.legacyLatinKey]))
watch(() => model.value?.latin, () => {
  if (hasLatinAddress(address.value)) latinOpen.value = true
})
const latinLabel = (key: keyof LatinAddress): string => {
  if (key === 'name') return t('address.fields.name')
  if (key === 'organization') return t('address.fields.organization')
  return fieldLabel(key)
}

// ------------------ 预览与旧的单行地址 ----------------------
const countryText = (code: string) => countryName(code, locale.value)
const englishCountry = (code: string) => countryName(code, 'en')
const localLines = computed(() => (hasStructuredAddress(address.value)
  ? formatAddressLines(address.value, { style: 'local', withNames: props.withOrganization, withCountry: true, countryLabel: countryText })
  : []))
const latinLines = computed(() => (hasLatinAddress(address.value)
  ? formatAddressLines(address.value, { style: 'latin', withNames: props.withOrganization, countryLabel: englishCountry })
  : []))
/** 旧的单行地址的写法（与后端生成的一致：不带姓名、本地写法不带国家） */
const formattedLocal = computed(() => (hasStructuredAddress(address.value) ? formatAddressOneLine(address.value, 'local') : ''))
const formattedLatin = computed(() => (hasLatinAddress(address.value) ? formatAddressOneLine(address.value, 'latin', englishCountry) : ''))

/**
 * 单行地址跟着结构化字段更新：空着、或与读进来时的排版一致（之前就是自动生成的）时自动；手工改过之后不再覆盖
 */
const legacyValue = (key: string | null): string => (key ? String(model.value?.[key] ?? '') : '')
const legacyAuto = ref(!legacyValue(props.legacyKey).trim() || legacyValue(props.legacyKey).trim() === formattedLocal.value)
const legacyLatinAuto = ref(!!props.legacyLatinKey
  && (!legacyValue(props.legacyLatinKey).trim() || legacyValue(props.legacyLatinKey).trim() === formattedLatin.value))
watch(formattedLocal, (value: string) => {
  // 没填结构化字段（旧数据只有单行地址）时不清空单行地址
  if (props.legacyKey && legacyAuto.value && value) model.value[props.legacyKey] = value
})
watch(formattedLatin, (value: string) => {
  if (props.legacyLatinKey && legacyLatinAuto.value && value) model.value[props.legacyLatinKey] = value
})
const onLegacyInput = (value: string) => {
  if (!props.legacyKey) return
  model.value[props.legacyKey] = value
  legacyAuto.value = !value.trim()
}
const onLegacyLatinInput = (value: string) => {
  if (!props.legacyLatinKey) return
  model.value[props.legacyLatinKey] = value
  legacyLatinAuto.value = !value.trim()
}
const useFormatted = () => {
  if (!props.legacyKey) return
  model.value[props.legacyKey] = formattedLocal.value
  legacyAuto.value = true
}
const useFormattedLatin = () => {
  if (!props.legacyLatinKey) return
  model.value[props.legacyLatinKey] = formattedLatin.value
  legacyLatinAuto.value = true
}
const legacyDiffers = computed(() =>
  !!props.legacyKey && !!formattedLocal.value && legacyValue(props.legacyKey).trim() !== formattedLocal.value)
const legacyLatinDiffers = computed(() =>
  !!props.legacyLatinKey && !!formattedLatin.value && legacyValue(props.legacyLatinKey).trim() !== formattedLatin.value)
</script>

<template>
  <WFormGrid class="w-structured-address">
    <WField :id="`${idPrefix}-country`" :label="t('common.fields.country')" :span="4" :optional="!countryRequired" :error="countryError"><CountryCombobox v-model="country" :disabled="!editable" /></WField>
    <WField v-if="withOrganization" :label="t('address.fields.organization')" optional><WInput :model-value="model.organization" :maxlength="MAX.organization" :disabled="!editable" @update:model-value="value=>setValue('organization',String(value??''))" /></WField>
    <WField v-for="field in parts" :key="field" :id="`${idPrefix}-${field}`" :label="fieldLabel(field)" optional :span="field.startsWith('address_line')?12:withDependentLocality?3:4">
      <WInput :model-value="valueOf(field)" :maxlength="MAX[field]" :disabled="!editable" :list="field==='admin_area'&&isJapan?`${idPrefix}-prefectures`:undefined" :placeholder="placeholderOf(field)" @update:model-value="value=>setValue(modelKeyOf(field),String(value??''))" @blur="field==='postal_code'?onPostalBlur():undefined"><template v-if="field==='postal_code'&&isJapan" #prefix>〒</template></WInput>
    </WField>
    <datalist v-if="isJapan" :id="`${idPrefix}-prefectures`"><option v-for="p in JP_PREFECTURES" :key="p" :value="p" /></datalist>
    <div class="w-address-preview w-span-6"><span>{{t('address.preview')}}</span><address><div v-for="(line,i) in localLines" :key="i">{{line}}</div><span v-if="!localLines.length">—</span></address></div>
    <WField v-if="legacyKey" :label="t('address.legacy')" optional :span="6" :hint="t(legacyAuto&&formattedLocal?'address.legacy-auto':legacyDiffers&&legacyValue(legacyKey).trim()?'address.legacy-differs':'address.legacy-hint')"><WTextarea :model-value="model[legacyKey]" :maxlength="255" :disabled="!editable" :rows="3" @update:model-value="value=>onLegacyInput(String(value??''))" /><WButton v-if="editable&&legacyDiffers&&!legacyAuto" variant="text" size="sm" @click="useFormatted">{{t('address.use-formatted')}}</WButton></WField>
    <div class="w-address-latin w-span-12"><button type="button" class="w-address-latin__toggle" :aria-expanded="latinOpen" @click="latinOpen=!latinOpen"><WIcon :name="latinOpen?'chevron-down':'chevron-right'" :size="16" />{{t('address.latin.title')}}</button><div v-if="latinOpen" class="w-address-latin__body"><p>{{t('address.latin.hint')}}</p><WFormGrid><WField v-for="key in latinKeys" :key="key" :label="latinLabel(key)" optional :span="key.startsWith('address_line')?12:6" :hint="hasNonLatin(latin[key])?t('address.latin.non-latin'):undefined"><WInput :model-value="latin[key]" :maxlength="MAX[key]||255" :disabled="!editable" @update:model-value="value=>setLatin(key,String(value??''))" /></WField></WFormGrid><address v-if="latinLines.length" class="w-address-latin-preview"><span>{{t('address.latin.preview')}}</span><div v-for="(line,i) in latinLines" :key="i">{{line}}</div></address><WField v-if="legacyLatinKey" :label="t('address.latin.legacy')" optional :hint="t(legacyLatinAuto&&formattedLatin?'address.legacy-auto':'address.latin.legacy-hint')"><WTextarea :model-value="model[legacyLatinKey]" :maxlength="500" :rows="2" :disabled="!editable" @update:model-value="value=>onLegacyLatinInput(String(value??''))" /><WButton v-if="editable&&legacyLatinDiffers&&!legacyLatinAuto" variant="text" size="sm" @click="useFormattedLatin">{{t('address.use-formatted')}}</WButton></WField></div></div>
  </WFormGrid>
</template>
<style scoped>
.w-structured-address { gap:12px 16px; }
.w-address-preview { display:flex; flex-direction:column; gap:4px; }
.w-address-preview>span { font-size:13px; line-height:20px; font-weight:500; }
.w-address-preview address { min-height:86px; margin:0; padding:12px 16px; border:1px solid var(--w-border); border-radius:6px; font-style:normal; font-size:14px; line-height:22px; }
.w-address-latin__toggle { width:100%; display:flex; align-items:center; gap:8px; min-height:40px; padding:8px 12px; border:1px solid var(--w-border); border-radius:6px; background:var(--w-surface); font:inherit; font-size:14px; line-height:20px; font-weight:600; color:var(--w-text-1); text-align:left; cursor:pointer; }
.w-address-latin__body { display:flex; flex-direction:column; gap:12px; padding:16px; }
.w-address-latin__body>p { margin:0; font-size:12px; line-height:18px; color:var(--w-text-3); }
.w-address-latin-preview { margin:0; padding:12px 16px; border:1px solid var(--w-border); border-radius:6px; font-style:normal; font-size:14px; line-height:22px; }
.w-address-latin-preview>span { font-size:12px; color:var(--w-text-3); }
</style>
