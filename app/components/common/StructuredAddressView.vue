<script lang="ts" setup>
/**
 * 结构化地址的显示（收件人 / 仓库详情页；字段见 composables/address/structuredAddress.ts）。
 * - 有结构化地址：按国家排版的本地写法（带国家行，国家名用当前语言）；单行地址与排版不一致时（手工写过）另列出来
 * - 有拉丁转写：再列拉丁写法（国家名用英文，跨境面单 / 单证用）；还有非拉丁文字时提示
 * - 没有结构化地址（旧数据）：显示单行地址（+ 邮编、国家）
 * legacyLatin：仓库的英文单行地址（address_en），与拉丁写法不一致或没有拉丁转写时列出
 */
import { hasNonLatin } from '~/composables/customs/customsDocuments'
import { countryName } from '~/data/countries'
import {
  formatAddressLines,
  formatAddressOneLine,
  hasLatinAddress,
  hasStructuredAddress,
  type StructuredAddress,
} from '~/composables/address/structuredAddress'

const props = withDefaults(defineProps<{
  address: Record<string, any> | null | undefined
  countryKey?: string
  postalKey?: string
  /** 带姓名 / 公司行（address 里的 name / organization） */
  withNames?: boolean
  /** 旧的单行地址（本地文字） */
  legacy?: string | null
  /** 旧的英文单行地址（仓库的 address_en） */
  legacyLatin?: string | null
}>(), {
  countryKey: 'country',
  postalKey: 'zip_code',
  withNames: false,
  legacy: null,
  legacyLatin: null,
})

const { t, locale } = useI18n()

const clean = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim())

/** 统一成结构化地址 */
const address = computed<StructuredAddress>(() => {
  const a = props.address || {}
  return {
    country: clean(a[props.countryKey]).toUpperCase() || null,
    postal_code: clean(a[props.postalKey] ?? a.postal_code) || null,
    admin_area: a.admin_area,
    locality: a.locality,
    dependent_locality: a.dependent_locality,
    address_line1: a.address_line1,
    address_line2: a.address_line2,
    organization: a.organization,
    name: a.name,
    latin: a.latin && typeof a.latin === 'object' ? a.latin : null,
  }
})

const countryText = (code: string) => countryName(code, locale.value)
const englishCountry = (code: string) => countryName(code, 'en')

const structured = computed(() => hasStructuredAddress(address.value))
const localLines = computed(() => (structured.value
  ? formatAddressLines(address.value, { style: 'local', withNames: props.withNames, withCountry: true, countryLabel: countryText })
  : []))
const latinLines = computed(() => (structured.value && hasLatinAddress(address.value)
  ? formatAddressLines(address.value, { style: 'latin', withNames: props.withNames, countryLabel: englishCountry })
  : []))

/** 单行地址与按结构化字段排的一致时不重复显示 */
const legacyText = computed(() => clean(props.legacy))
const legacyDiffers = computed(() => structured.value && !!legacyText.value
  && legacyText.value !== formatAddressOneLine(address.value, 'local'))
const legacyLatinText = computed(() => clean(props.legacyLatin))
const legacyLatinShown = computed(() => !!legacyLatinText.value
  && (!latinLines.value.length || legacyLatinText.value !== formatAddressOneLine(address.value, 'latin', englishCountry)))

/** 旧数据：单行地址 + 邮编（单行里已经有邮编时不再加）、国家 */
const fallbackLines = computed(() => {
  if (structured.value) return []
  const lines: string[] = []
  const postal = clean(address.value.postal_code)
  const line = legacyText.value && postal && !legacyText.value.includes(postal) ? `${legacyText.value} ${postal}` : (legacyText.value || postal)
  if (line) lines.push(line)
  if (address.value.country) lines.push(countryText(address.value.country))
  return lines
})
</script>

<template>
  <div class="structured-address-view">
    <template v-if="structured">
      <div v-for="(line, i) in localLines" :key="`ll-${i}`">{{ line }}</div>
      <div class="fs-12 mt-1" v-if="legacyDiffers">
        <span class="text-muted">{{ t('address.legacy') }}：</span>{{ legacyText }}
      </div>
    </template>
    <template v-else-if="fallbackLines.length">
      <div v-for="(line, i) in fallbackLines" :key="`fl-${i}`">{{ line }}</div>
    </template>
    <div v-else>—</div>

    <div class="mt-2" v-if="latinLines.length">
      <div class="fs-12 text-muted mb-1">{{ t('address.latin.title') }}</div>
      <div v-for="(line, i) in latinLines" :key="`lt-${i}`">{{ line }}</div>
      <div class="fs-12 text-warning mt-1" v-if="latinLines.some((line) => hasNonLatin(line))">{{ t('address.latin.preview-non-latin') }}</div>
    </div>
    <div class="mt-2" v-if="legacyLatinShown">
      <div class="fs-12 text-muted mb-1">{{ t('address.latin.legacy') }}</div>
      <div>{{ legacyLatinText }}</div>
      <div class="fs-12 text-warning mt-1" v-if="hasNonLatin(legacyLatinText)">{{ t('common.tips.non-latin') }}</div>
    </div>
  </div>
</template>
