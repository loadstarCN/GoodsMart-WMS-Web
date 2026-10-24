/**
 * 结构化国际地址（后端 doc/shipping-flow.md §6.2）：收件人、仓库、DN 收件地址快照（ship_to）用同一组字段名：
 * country（ISO 3166-1 alpha-2）、postal_code（收件人也收 / 给 zip_code）、admin_area（州 / 省 / 都道府县）、
 * locality（市区町村）、dependent_locality（町域 / 区）、address_line1、address_line2、organization、name、phone、email，
 * 以及拉丁转写 latin {name, organization, address_line1, address_line2, locality, admin_area}（跨境面单用）。
 *
 * 这里只做界面的事：按国家排输入框的顺序、换字段名称（都道府県 / State / Province……）、预览排版。
 * 排版与后端 warehouse/common/address_format.py + warehouse/country_rules 的行模板一致（日本：〒邮编 / 都道府県市区町村 /
 * 番地 建物 / 公司 / 姓名，单行用空格连；美国：街道 / City, ST ZIP / 国家；其他：街道 / 城市 州 邮编 / 国家，单行用「, 」连）。
 * 旧的单行地址（address / shipping_address / address_en）由后端在只给了结构化字段时按同样的写法生成。
 */

export interface LatinAddress {
  name?: string | null
  organization?: string | null
  address_line1?: string | null
  address_line2?: string | null
  locality?: string | null
  admin_area?: string | null
}

export interface StructuredAddress {
  country?: string | null
  postal_code?: string | null
  /** 收件人的旧字段名（= postal_code） */
  zip_code?: string | null
  admin_area?: string | null
  locality?: string | null
  dependent_locality?: string | null
  address_line1?: string | null
  address_line2?: string | null
  organization?: string | null
  name?: string | null
  phone?: string | null
  email?: string | null
  latin?: LatinAddress | null
}

/** 地址本体的输入框（不含国家、名称、电话） */
export type AddressPartKey = 'postal_code' | 'admin_area' | 'locality' | 'dependent_locality' | 'address_line1' | 'address_line2'
export const LATIN_KEYS: (keyof LatinAddress)[] = ['name', 'organization', 'address_line1', 'address_line2', 'locality', 'admin_area']

/** 有没有结构化地址看的字段（只有姓名 / 电话 / 邮编不算），与后端 STRUCTURED_FIELDS 一致 */
const STRUCTURED_FIELDS = ['admin_area', 'locality', 'dependent_locality', 'address_line1', 'address_line2']

/** 本地文字从大到小写（〒邮编 → 都道府県 → 市区町村 → 番地）的国家；其余按欧美写法（街道 → 城市 → 州 → 邮编） */
const BIG_ENDIAN_COUNTRIES = ['JP']

export const isBigEndianCountry = (country: string | null | undefined): boolean =>
  BIG_ENDIAN_COUNTRIES.includes(String(country || '').toUpperCase())

/** 输入框的顺序：日本 〒邮编 → 都道府県 → 市区町村 → 町域 → 番地 → 建物；其他 街道 → 补充 → 区 → 城市 → 州 → 邮编 */
export const addressPartOrder = (country: string | null | undefined): AddressPartKey[] =>
  isBigEndianCountry(country)
    ? ['postal_code', 'admin_area', 'locality', 'dependent_locality', 'address_line1', 'address_line2']
    : ['address_line1', 'address_line2', 'dependent_locality', 'locality', 'admin_area', 'postal_code']

/** 字段名称按国家换说法的（i18n address.fields.<field>.<国家>，没有时用 default） */
export const ADDRESS_LABEL_COUNTRIES = ['JP', 'US', 'CA', 'CN', 'GB', 'AU', 'KR', 'TW']

export const addressLabelKeys = (field: string, country: string | null | undefined): string[] => {
  const code = String(country || '').toUpperCase()
  return [
    ...(ADDRESS_LABEL_COUNTRIES.includes(code) ? [`address.fields.${field}.${code}`] : []),
    `address.fields.${field}.default`,
  ]
}

/** 日本的都道府県（admin_area 的候选） */
export const JP_PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県',
  '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県',
  '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県',
  '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
]

/** 日本的邮编：7 位数字补成 123-4567（全角数字转半角）；其他国家原样（去前后空格） */
export const normalizePostalCode = (value: string | null | undefined, country: string | null | undefined): string => {
  const raw = String(value ?? '').trim()
  if (String(country || '').toUpperCase() !== 'JP') return raw
  const half = raw.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[ー－‐−]/g, '-')
  const digits = half.replace(/\D/g, '')
  return digits.length === 7 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : half
}

const clean = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim())

/** 有没有填结构化的地址（只看地址本体，不看国家 / 名称 / 邮编） */
export const hasStructuredAddress = (a: StructuredAddress | null | undefined): boolean =>
  !!a && STRUCTURED_FIELDS.some((k) => clean((a as Record<string, unknown>)[k]) !== '')

export const hasLatinAddress = (a: StructuredAddress | null | undefined): boolean =>
  !!a?.latin && typeof a.latin === 'object' && LATIN_KEYS.some((k) => clean(a.latin?.[k]) !== '')

// ------------------ 排版（后端 country_rules 的行模板） ----------------------
const DEFAULT_FORMAT = [
  '{name}', '{organization}', '{address_line1}', '{address_line2}', '{dependent_locality}',
  '{locality} {admin_area} {postal_code}', '{country_name}',
]
const US_FORMAT = [
  '{name}', '{organization}', '{address_line1}', '{address_line2}', '{locality}, {admin_area} {postal_code}', '{country_name}',
]
interface CountryFormat {
  local: string[]
  latin: string[]
  separator: { local: string; latin: string }
}
const FORMATS: Record<string, CountryFormat> = {
  JP: {
    local: ['〒{postal_code}', '{admin_area}{locality}{dependent_locality}', '{address_line1} {address_line2}', '{organization}', '{name}'],
    latin: [
      '{name}', '{organization}', '{address_line1}', '{address_line2}', '{dependent_locality}',
      '{locality}, {admin_area} {postal_code}', '{country_name}',
    ],
    separator: { local: ' ', latin: ', ' },
  },
  US: { local: US_FORMAT, latin: US_FORMAT, separator: { local: ', ', latin: ', ' } },
}
const DEFAULT_RULES: CountryFormat = { local: DEFAULT_FORMAT, latin: DEFAULT_FORMAT, separator: { local: ', ', latin: ', ' } }
const rulesFor = (country: string): CountryFormat => FORMATS[country] || DEFAULT_RULES

const PLACEHOLDER = /\{([a-z_0-9]+)\}/g
const NAME_FIELDS = ['name', 'organization']

/** 一行模板 → 文字：占位的字段都没有时整行不要；连续的逗号 / 空白合并，去掉首尾的逗号 */
const renderLine = (template: string, values: Record<string, string>): string => {
  const keys = [...template.matchAll(PLACEHOLDER)].map((m) => m[1] as string)
  if (keys.length && !keys.some((k) => values[k])) return ''
  return template
    .replace(PLACEHOLDER, (_m, k: string) => values[k] || '')
    .replace(/\s*,(\s*,)*\s*/g, ', ')
    .replace(/[ \t　]{2,}/g, ' ')
    .trim()
    .replace(/^,+|,+$/g, '')
    .trim()
}

/** 拉丁文字的地址：latin 里有的字段覆盖本地文字（没有转写的字段用本地文字），与后端 latin_view 一致 */
const latinView = (address: StructuredAddress): Record<string, unknown> => {
  const values: Record<string, unknown> = { ...address }
  const latin = (address.latin || {}) as Record<string, unknown>
  for (const key of LATIN_KEYS) {
    if (clean(latin[key])) values[key] = latin[key]
  }
  return values
}

export interface FormatOptions {
  /** local：本地文字；latin：拉丁转写（没有转写的字段用本地文字） */
  style?: 'local' | 'latin'
  /** 带姓名 / 公司行（面单的写法）；默认不带 */
  withNames?: boolean
  /** 带国家行；默认 latin 带、local 不带（与后端一致） */
  withCountry?: boolean
  /** 国家名（默认英文名，界面上可以换成当前语言的） */
  countryLabel?: ((code: string) => string) | null
}

/** 按收件国排成几行（预览、详情页显示）；没有内容返回空数组 */
export const formatAddressLines = (address: StructuredAddress | null | undefined, options: FormatOptions = {}): string[] => {
  if (!address) return []
  const style = options.style || 'local'
  const country = clean(address.country).toUpperCase()
  const source = style === 'latin' ? latinView(address) : (address as Record<string, unknown>)
  const values: Record<string, string> = {}
  for (const [k, v] of Object.entries(source)) {
    if (k !== 'latin') values[k] = clean(v)
  }
  values.postal_code = clean(address.postal_code ?? address.zip_code)
  values.country_name = country ? (options.countryLabel ? options.countryLabel(country) : country) : ''
  const withCountry = options.withCountry ?? style === 'latin'
  const lines: string[] = []
  for (const template of rulesFor(country)[style]) {
    const keys = [...template.matchAll(PLACEHOLDER)].map((m) => m[1] as string)
    if (!options.withNames && keys.length && keys.every((k) => NAME_FIELDS.includes(k))) continue
    if (!withCountry && keys.length === 1 && keys[0] === 'country_name') continue
    const line = renderLine(template, values)
    if (line) lines.push(line)
  }
  return lines
}

/**
 * 单行写法（旧的 address / shipping_address / address_en，与后端 format_single_line 一致）：不带姓名 / 公司；
 * 本地写法不带国家、拉丁写法带国家（英文名）；日本的本地写法用空格连，其他用「, 」
 */
export const formatAddressOneLine = (
  address: StructuredAddress | null | undefined,
  style: 'local' | 'latin' = 'local',
  countryLabel: ((code: string) => string) | null = null,
): string => {
  if (!address) return ''
  const country = clean(address.country).toUpperCase()
  return formatAddressLines(address, { style, countryLabel }).join(rulesFor(country).separator[style])
}

// ------------------ DN 的收件地址（ship_to）与错误提示 ----------------------
/** 结构化地址对象的字段（DN 的 ship_to 快照；不含 latin） */
export const ADDRESS_KEYS = [
  'country', 'postal_code', 'admin_area', 'locality', 'dependent_locality', 'address_line1', 'address_line2',
  'organization', 'name', 'phone', 'email',
] as const

/**
 * 收件人主数据（GET /recipient/<id>）→ 结构化地址，与后端 address_format.recipient_address 一致：
 * name = 联系人（没有用收件方名称），organization = 收件人的 organization（没有且有联系人时用收件方名称）
 */
export const shipToFromRecipient = (recipient: Record<string, any> | null | undefined): StructuredAddress => {
  if (!recipient) return {}
  const display = clean(recipient.name)
  const contact = clean(recipient.contact)
  let organization = clean(recipient.organization)
  if (!organization && contact && display && display !== contact) organization = display
  const latin = recipient.latin && typeof recipient.latin === 'object' ? { ...recipient.latin } : null
  return {
    country: clean(recipient.country).toUpperCase() || null,
    postal_code: clean(recipient.zip_code ?? recipient.postal_code) || null,
    admin_area: clean(recipient.admin_area) || null,
    locality: clean(recipient.locality) || null,
    dependent_locality: clean(recipient.dependent_locality) || null,
    address_line1: clean(recipient.address_line1) || null,
    address_line2: clean(recipient.address_line2) || null,
    organization: organization || null,
    name: contact || display || null,
    phone: clean(recipient.phone) || null,
    email: clean(recipient.email) || null,
    latin: latin && LATIN_KEYS.some((k) => clean(latin[k]) !== '') ? latin : null,
  }
}

/** 只留有值的字段（latin 也是；邮编统一成 postal_code）→ 提交用的地址对象；什么都没有时 null */
export const cleanShipTo = (address: Record<string, any> | null | undefined): StructuredAddress | null => {
  if (!address) return null
  const result: Record<string, any> = {}
  for (const key of ADDRESS_KEYS) {
    const value = clean(key === 'postal_code' ? (address.postal_code ?? address.zip_code) : address[key])
    if (value) result[key] = key === 'country' ? value.toUpperCase() : value
  }
  const latin: Record<string, string> = {}
  for (const key of LATIN_KEYS) {
    const value = clean(address.latin?.[key])
    if (value) latin[key] = value
  }
  if (Object.keys(latin).length) result.latin = latin
  return Object.keys(result).length ? (result as StructuredAddress) : null
}

/**
 * 结构化地址字段的名称（后端 400 14019 / 14020 的 field，如 ship_to.address_line1、latin.name、postal_code）。
 * t / te 由调用方传入（useI18n）；认不出的字段原样返回。
 */
export const addressFieldLabel = (
  field: string | null | undefined,
  country: string | null | undefined,
  t: (key: string) => string,
  te: (key: string) => boolean,
): string => {
  const raw = String(field || '').replace(/^(ship_to|shipper)\./, '')
  const isLatin = raw.startsWith('latin.')
  const key = isLatin ? raw.slice('latin.'.length) : raw
  const COMMON: Record<string, string> = {
    country: 'common.fields.country', country_code: 'common.fields.country', phone: 'common.fields.phone',
    email: 'common.fields.email', zip_code: 'address.fields.postal_code.default',
  }
  // 姓名 / 公司是一条文案；地址本体的字段名按国家换说法（address.fields.<field>.<国家> / default）
  const candidates = COMMON[key] ? [COMMON[key]]
    : NAME_FIELDS.includes(key) ? [`address.fields.${key}`]
      : addressLabelKeys(key, country)
  const hit = candidates.find((k) => te(k))
  const label = hit ? t(hit) : key || raw
  return isLatin ? `${t('address.latin.title')} · ${label}` : label
}
