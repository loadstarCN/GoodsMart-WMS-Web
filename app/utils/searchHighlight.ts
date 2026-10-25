/**
 * 搜索结果的高亮：按后端给的 highlights（[{field, start, end}]，UTF-16 码元下标 = JS 字符串下标，end 不含）切分显示文本。
 * 前端不自己再匹配关键字——后端按实际的匹配规则算位置（运单号去分隔符比较后换算回原文、纯数字单号只标数字部分）。
 */

export interface HighlightRange {
  start: number
  end: number
}

export interface HighlightPart {
  text: string
  hit: boolean
  /** 这一段在原文里的起点 */
  start: number
}

interface HighlightLike {
  field: string
  start: number
  end: number
}

/** 某个字段（code / title / subtitle / columns.<列>）的高亮区间：截到文本长度内、排序、合并重叠和相邻的 */
export function highlightRanges(highlights: readonly HighlightLike[] | null | undefined, field: string, length: number): HighlightRange[] {
  const ranges = (highlights || [])
    .filter((h) => h.field === field)
    .map((h) => ({ start: Math.max(0, Math.trunc(h.start)), end: Math.min(length, Math.trunc(h.end)) }))
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.start < r.end)
    .sort((a, b) => a.start - b.start)
  const merged: HighlightRange[] = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end)
    else merged.push({ ...range })
  }
  return merged
}

/**
 * 按高亮区间把文本切成若干段（命中 / 未命中交替）。breaks：另外在这些位置断开
 * （界面要在某个位置前插入文字时用，如副标题里命中商品那一部分前面的「含」）。
 */
export function highlightParts(text: string | null | undefined, ranges: readonly HighlightRange[], breaks: readonly number[] = []): HighlightPart[] {
  const value = text ?? ''
  if (!value) return []
  const cuts = new Set<number>([0, value.length])
  for (const range of ranges) {
    cuts.add(Math.max(0, Math.min(value.length, range.start)))
    cuts.add(Math.max(0, Math.min(value.length, range.end)))
  }
  for (const pos of breaks) if (pos > 0 && pos < value.length) cuts.add(pos)
  const points = [...cuts].sort((a, b) => a - b)
  const parts: HighlightPart[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]!
    const end = points[i + 1]!
    if (start >= end) continue
    const hit = ranges.some((r) => r.start <= start && end <= r.end)
    parts.push({ text: value.slice(start, end), hit, start })
  }
  return parts
}

/**
 * 「 · 」分隔的副标题里，最后一个带高亮的部分从哪里开始（没有高亮时 null）。
 * 后端拼副标题时明细商品排在单号、运单号之后、仓库名之前，仓库名不标高亮——命中在明细商品时，最后一个带高亮的部分就是该商品。
 */
export function lastHighlightedSegmentStart(text: string | null | undefined, ranges: readonly HighlightRange[], separator = ' · '): number | null {
  const value = text ?? ''
  if (!value || ranges.length === 0) return null
  let found: number | null = null
  let start = 0
  while (start <= value.length) {
    const next = value.indexOf(separator, start)
    const end = next < 0 ? value.length : next
    if (ranges.some((r) => r.start < end && r.end > start)) found = start
    if (next < 0) break
    start = next + separator.length
  }
  return found
}
