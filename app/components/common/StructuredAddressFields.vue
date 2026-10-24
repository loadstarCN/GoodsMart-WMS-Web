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
const COLS: Record<AddressPartKey, string> = {
  postal_code: 'col-md-4',
  admin_area: 'col-md-4',
  locality: 'col-md-4',
  dependent_locality: 'col-md-6',
  address_line1: 'col-md-12',
  address_line2: 'col-md-12',
}
// 与后端的列宽一致（收件人 / 仓库的 zip_code 是 10 位，单行地址 address 255、address_en 500）
const MAX: Record<string, number> = {
  postal_code: 10, admin_area: 100, locality: 100, dependent_locality: 100, address_line1: 255, address_line2: 255,
  organization: 255, name: 255,
}
const fieldLabel = (field: string): string => {
  const key = addressLabelKeys(field, country.value).find((k: string) => te(k))
  return key ? t(key) : field
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
  <div class="row gy-3 structured-address">
    <!-- 国家 / 公司 -->
    <div class="col-xl-6">
      <label :for="`${idPrefix}-country`" class="form-label">
        {{ t('common.fields.country') }} <abbr title="required" aria-hidden="true" class="text-danger" v-if="countryRequired">*</abbr>
      </label>
      <CountrySelect :id="`${idPrefix}-country`" v-model="country" :disabled="!editable" />
      <div class="form-text">{{ t('address.tips.country') }}</div>
      <div v-if="countryError" class="invalid-feedback d-block">{{ countryError }}</div>
    </div>
    <div class="col-xl-6" v-if="withOrganization">
      <label :for="`${idPrefix}-organization`" class="form-label">{{ t('address.fields.organization') }}</label>
      <input type="text" class="form-control" :id="`${idPrefix}-organization`" :maxlength="MAX.organization" :disabled="!editable"
        :placeholder="t('address.placeholders.organization')" :value="model.organization ?? ''"
        @input="setValue('organization', ($event.target as HTMLInputElement).value)">
    </div>
    <div class="w-100 m-0" v-else></div>

    <!-- 地址本体（顺序按国家） -->
    <div v-for="field in parts" :key="field" :class="COLS[field]">
      <label :for="`${idPrefix}-${field}`" class="form-label">{{ fieldLabel(field) }}</label>
      <div class="input-group" v-if="field === 'postal_code' && isJapan">
        <span class="input-group-text">〒</span>
        <input type="text" class="form-control" :id="`${idPrefix}-${field}`" :maxlength="MAX[field]" :disabled="!editable"
          inputmode="numeric" :placeholder="placeholderOf(field)" :value="valueOf(field)"
          @input="setValue(modelKeyOf(field), ($event.target as HTMLInputElement).value)" @blur="onPostalBlur">
      </div>
      <input type="text" class="form-control" :id="`${idPrefix}-${field}`" :maxlength="MAX[field]" :disabled="!editable"
        :list="field === 'admin_area' && isJapan ? `${idPrefix}-prefectures` : undefined"
        :placeholder="placeholderOf(field)" :value="valueOf(field)" v-else
        @input="setValue(modelKeyOf(field), ($event.target as HTMLInputElement).value)"
        @blur="field === 'postal_code' ? onPostalBlur() : undefined">
    </div>
    <datalist :id="`${idPrefix}-prefectures`" v-if="isJapan">
      <option v-for="p in JP_PREFECTURES" :key="p" :value="p"></option>
    </datalist>

    <!-- 排版预览 + 旧的单行地址 -->
    <div class="col-xl-12">
      <div class="structured-address-preview fs-13" v-if="localLines.length">
        <div class="fs-12 text-muted mb-1">{{ t('address.preview') }}</div>
        <div v-for="(line, i) in localLines" :key="`ll-${i}`">{{ line }}</div>
      </div>
      <template v-if="legacyKey">
        <label :for="`${idPrefix}-legacy`" class="form-label mt-2">{{ t('address.legacy') }}</label>
        <input type="text" class="form-control" :id="`${idPrefix}-legacy`" maxlength="255" :disabled="!editable"
          :placeholder="t('common.placeholders.address')" :value="model[legacyKey] ?? ''"
          @input="onLegacyInput(($event.target as HTMLInputElement).value)">
        <div class="form-text" :class="{ 'text-warning': legacyDiffers && !legacyAuto && !!legacyValue(legacyKey).trim() }">
          <template v-if="legacyAuto && formattedLocal">{{ t('address.legacy-auto') }}</template>
          <!-- 手工写的单行地址与上面的结构化地址不一致（如旧数据只有单行地址、后来补了结构化字段） -->
          <template v-else-if="legacyDiffers && legacyValue(legacyKey).trim()">{{ t('address.legacy-differs') }}</template>
          <template v-else>{{ t('address.legacy-hint') }}</template>
          <button type="button" class="btn btn-link btn-sm p-0 ms-1 align-baseline fs-12" v-if="editable && legacyDiffers && !legacyAuto"
            @click="useFormatted">{{ t('address.use-formatted') }}</button>
        </div>
      </template>
    </div>

    <!-- 拉丁转写（国际面单用） -->
    <div class="col-xl-12">
      <details class="structured-address-latin" :open="latinOpen" @toggle="latinOpen = ($event.target as HTMLDetailsElement).open">
        <summary class="fs-13 text-primary">{{ t('address.latin.title') }}</summary>
        <p class="fs-12 text-muted mb-2 mt-2">{{ t('address.latin.hint') }}</p>
        <div class="row gy-2">
          <div v-for="key in latinKeys" :key="key"
            :class="key === 'address_line1' || key === 'address_line2' ? 'col-md-12' : 'col-md-6'">
            <label :for="`${idPrefix}-latin-${key}`" class="form-label fs-13 mb-1">{{ latinLabel(key) }}</label>
            <input type="text" class="form-control form-control-sm" :id="`${idPrefix}-latin-${key}`" :maxlength="MAX[key] || 255"
              :disabled="!editable" :value="latin[key] ?? ''" @input="setLatin(key, ($event.target as HTMLInputElement).value)">
            <div class="form-text text-warning" v-if="hasNonLatin(latin[key])">{{ t('address.latin.non-latin') }}</div>
          </div>
        </div>
        <div class="structured-address-preview fs-13 mt-2" v-if="latinLines.length">
          <div class="fs-12 text-muted mb-1">{{ t('address.latin.preview') }}</div>
          <div v-for="(line, i) in latinLines" :key="`lt-${i}`">{{ line }}</div>
          <div class="fs-12 text-warning mt-1" v-if="latinLines.some((line) => hasNonLatin(line))">{{ t('address.latin.preview-non-latin') }}</div>
        </div>
        <template v-if="legacyLatinKey">
          <label :for="`${idPrefix}-legacy-latin`" class="form-label fs-13 mt-2 mb-1">{{ t('address.latin.legacy') }}</label>
          <textarea class="form-control" :id="`${idPrefix}-legacy-latin`" rows="2" maxlength="500" :disabled="!editable"
            :value="model[legacyLatinKey] ?? ''" @input="onLegacyLatinInput(($event.target as HTMLTextAreaElement).value)"></textarea>
          <div class="form-text text-warning" v-if="hasNonLatin(model[legacyLatinKey])">{{ t('common.tips.non-latin') }}</div>
          <div class="form-text">
            <template v-if="legacyLatinAuto && formattedLatin">{{ t('address.legacy-auto') }}</template>
            <template v-else>{{ t('address.latin.legacy-hint') }}</template>
            <button type="button" class="btn btn-link btn-sm p-0 ms-1 align-baseline fs-12"
              v-if="editable && legacyLatinDiffers && !legacyLatinAuto" @click="useFormattedLatin">{{ t('address.use-formatted') }}</button>
          </div>
        </template>
      </details>
    </div>
  </div>
</template>

<style scoped>
.structured-address-preview {
  border: 1px dashed var(--default-border);
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  white-space: pre-wrap;
}

.structured-address-latin summary {
  cursor: pointer;
}
</style>
