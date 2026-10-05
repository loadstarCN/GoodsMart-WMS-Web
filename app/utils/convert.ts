export function convert_tags_to_array(tags: string | null) {
  if (tags && tags !== '') {
    return tags.split(',')
  } else {
    return []
  }
}

/**
 * 数值输入框（v-maska 文本框等）的值转成提交值：空（null / undefined / 空串 / 全空白）→ null，其余转数字。
 * 填了又清空的框会是空串，原样提交会让后端数值列报错（PG 500）。
 */
export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : Number(text)
}

export function convert_tags_to_string(tags: string[]) {
  if (tags && tags.length > 0) {
    return tags.join(',')
  } else {
    return null
  }
}
