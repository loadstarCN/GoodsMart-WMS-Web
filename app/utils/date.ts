import { isValid, parseISO, formatISO } from 'date-fns';
// /​**​
//  * 安全格式化日期到YYYY-MM-DD格式
//  * @param inputDate 输入日期（支持字符串、Date对象或null/undefined）
//  * @returns 格式化后的日期字符串或null
//  * 
//  * 功能特性：
//  * 1. 自动处理字符串/Date类型输入
//  * 2. 内置日期有效性验证
//  * 3. 完善的错误处理机制
//  * 4. TypeScript类型安全
//  */
export function safeFormatDate(
  inputDate: string | Date | null | undefined
): string | null {
  if (!inputDate) return null;

  try {
    let parsedDate: Date;

    // 类型判断分支
    if (typeof inputDate === 'string') {
      parsedDate = parseISO(inputDate);
    } else if (inputDate instanceof Date) {
      parsedDate = inputDate;
    } else {
      console.error('Unexpected date type:', typeof inputDate);
      return null;
    }

    // 日期有效性验证
    if (!isValid(parsedDate)) {
      console.error('Invalid date:', inputDate);
      return null;
    }

    // 返回格式化结果
    return formatISO(parsedDate, { representation: 'date' });
  } catch (error) {
    console.error('Date formatting failed:', error);
    return null;
  }
}



export function safeFormatDateTime(
  inputDate: string | Date | null | undefined
): string | null {
  if (!inputDate) return null;

  try {
    let parsedDate: Date;

    // 类型判断分支
    if (typeof inputDate === 'string') {
      parsedDate = parseISO(inputDate);
    } else if (inputDate instanceof Date) {
      parsedDate = inputDate;
    } else {
      console.error('Unexpected date type:', typeof inputDate);
      return null;
    }

    // 日期有效性验证
    if (!isValid(parsedDate)) {
      console.error('Invalid date:', inputDate);
      return null;
    }

    // 返回完整的ISO日期时间（包含时区偏移）
    return formatISO(parsedDate);
  } catch (error) {
    console.error('DateTime formatting failed:', error);
    return null;
  }
}

/**
 * 任务列表项（分拣 / 拣货 / 打包任务）在单据时间线上的时间：完成时间优先，没完成时用最后更新时间。
 * 列表接口的任务项没有 sorting_time / picking_time / packing_time（那是任务明细的字段）。
 */
export function taskTimelineTime(task: any): string | null {
  return task?.completed_at || task?.updated_at || task?.started_at || task?.created_at || null;
}

/** 一组任务里最晚的时间线时间（时间线「已分拣 / 已拣货 / 已打包」的标题时间）；没有可用时间时返回 null */
export function latestTaskTimelineTime(tasks: any[] | null | undefined): string | null {
  let latest: string | null = null;
  let latestMs = -Infinity;
  for (const task of tasks || []) {
    const value = taskTimelineTime(task);
    if (!value) continue;
    const ms = parseISO(String(value)).getTime();
    if (!isNaN(ms) && ms > latestMs) {
      latest = String(value);
      latestMs = ms;
    }
  }
  return latest;
}

// ------------------ 时区（后端 doc/timezone-utc.md：时刻存 UTC，界面按单据所属仓库的时区显示 / 输入） ----------------------
//
// 后端的时刻是带偏移的 ISO 8601（UTC，2026-10-23T04:03:00+00:00）；过渡期旧接口还会给不带时区的墙上时间
// （2026-10-23T13:03:00），按单据所属仓库的时区解释（后端对旧值也是这样）。只有日期的字段（YYYY-MM-DD：计划发货日、
// 揽收日……）是仓库当地的日期，原样显示、不按时区挪。只用 Intl（timeZone），不引时区库；formatter 按时区缓存。

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAIVE_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?$/;
const OFFSET_RE = /(?:[zZ]|[+-]\d{2}(?::?\d{2})?)$/;
const pad2 = (n: number) => String(n).padStart(2, '0');

let cachedBrowserZone: string | null = null;
/** 浏览器所在的时区（IANA 名，打开页面时取一次）；取不到时 UTC */
export function browserTimeZone(): string {
  if (cachedBrowserZone) return cachedBrowserZone;
  try {
    cachedBrowserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    cachedBrowserZone = 'UTC';
  }
  return cachedBrowserZone;
}

const validZones = new Map<string, boolean>();
/** 是浏览器认识的 IANA 时区名 */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  const cached = validZones.get(tz);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    ok = true;
  } catch {
    ok = false;
  }
  validZones.set(tz, ok);
  return ok;
}

/** 合法的时区原样返回，否则浏览器时区 */
export function effectiveTimeZone(tz?: string | null): string {
  return isValidTimeZone(tz) ? tz : browserTimeZone();
}

export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const partsFormatter = (tz: string): Intl.DateTimeFormat => {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    partsFormatters.set(tz, f);
  }
  return f;
};

/** 时刻在某时区的墙上时间（年月日时分秒）；时区不合法按浏览器时区 */
export function zonedParts(date: Date, timeZone?: string | null): ZonedParts {
  const tz = effectiveTimeZone(timeZone);
  try {
    const out: Record<string, number> = {};
    for (const p of partsFormatter(tz).formatToParts(date)) {
      if (p.type !== 'literal') out[p.type] = Number(p.value);
    }
    return {
      year: out.year ?? date.getFullYear(),
      month: out.month ?? date.getMonth() + 1,
      day: out.day ?? date.getDate(),
      // 老浏览器不认 hourCycle 时午夜会给 24
      hour: (out.hour ?? date.getHours()) % 24,
      minute: out.minute ?? date.getMinutes(),
      second: out.second ?? date.getSeconds(),
    };
  } catch {
    return {
      year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
      hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds(),
    };
  }
}

/** 时区在某时刻相对 UTC 的偏移（分钟，东正：东京 +540、洛杉矶夏令时 -420） */
export function timeZoneOffsetMinutes(date: Date, timeZone?: string | null): number {
  const ms = date.getTime();
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - (ms - (((ms % 1000) + 1000) % 1000))) / 60000);
}

/**
 * 某时区的墙上时间 → 时刻。夏令时开始时不存在的时刻（如洛杉矶 3/8 02:30）往后挪到切换后（03:30）；
 * 结束时重复的时刻取其中一个
 */
export function zonedTimeToDate(
  year: number, month: number, day: number,
  hour = 0, minute = 0, second = 0, ms = 0,
  timeZone?: string | null,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const first = timeZoneOffsetMinutes(new Date(wall), timeZone);
  let at = wall - first * 60000;
  const second2 = timeZoneOffsetMinutes(new Date(at), timeZone);
  if (second2 !== first) {
    // 第一次按 wall 估的偏移跨过了切换点：换成第二次的偏移，对得上才用（对不上 = 不存在的时刻，保留往后挪的结果）
    const alt = wall - second2 * 60000;
    if (timeZoneOffsetMinutes(new Date(alt), timeZone) === second2) at = alt;
  }
  return new Date(at);
}

/**
 * 解析时刻：
 * - Date / 毫秒数原样
 * - 带 Z / ±HH:MM 偏移的 ISO 8601 按偏移
 * - 不带时区的「YYYY-MM-DD[T ]HH:mm[:ss[.ffffff]]」当作 timeZone 的墙上时间（旧接口 / 旧数据）
 * - 只有日期（YYYY-MM-DD）→ timeZone 当地 00:00
 * 空 / 不合法 → null
 */
export function parseDateTime(value: unknown, timeZone?: string | null): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  const text = String(value).trim();
  if (!text) return null;
  let m = DATE_ONLY_RE.exec(text);
  if (m) return zonedTimeToDate(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, 0, 0, timeZone);
  m = NAIVE_DATETIME_RE.exec(text);
  if (m) {
    const ms = m[7] ? Number(m[7].slice(0, 3).padEnd(3, '0')) : 0;
    return zonedTimeToDate(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0), ms, timeZone);
  }
  let normalized = text;
  if (OFFSET_RE.test(text)) {
    normalized = text
      .replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T')
      .replace(/([.,])(\d{3})\d+/, '.$2')
      .replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
      .replace(/([+-]\d{2})$/, '$1:00');
  }
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

/** 只有日期（YYYY-MM-DD，仓库当地的业务日期） */
export function isDateOnly(value: unknown): value is string {
  return typeof value === 'string' && DATE_ONLY_RE.test(value.trim());
}

const TOKEN_RE = /\[([^\]]*)]|YYYY|YY|MM|M|DD|D|HH|H|mm|m|ss|s/g;
const formatParts = (p: ZonedParts, pattern: string): string =>
  pattern.replace(TOKEN_RE, (token: string, escaped?: string) => {
    if (escaped !== undefined) return escaped;
    switch (token) {
      case 'YYYY': return String(p.year).padStart(4, '0');
      case 'YY': return pad2(p.year % 100);
      case 'MM': return pad2(p.month);
      case 'M': return String(p.month);
      case 'DD': return pad2(p.day);
      case 'D': return String(p.day);
      case 'HH': return pad2(p.hour);
      case 'H': return String(p.hour);
      case 'mm': return pad2(p.minute);
      case 'm': return String(p.minute);
      case 'ss': return pad2(p.second);
      case 's': return String(p.second);
      default: return token;
    }
  });

/** 两个时区在某时刻的墙上时间一样（偏移相同） */
export function sameWallTime(a: string | null | undefined, b: string | null | undefined, at: Date = new Date()): boolean {
  return timeZoneOffsetMinutes(at, a) === timeZoneOffsetMinutes(at, b);
}

/**
 * 按 dayjs 风格的格式（YYYY MM DD HH mm ss，[..] 原样）在某时区格式化时刻；只有日期的值不挪日期。
 * 格式里有时分、时区与浏览器不同（该时刻的偏移不同）时，withZone 默认在后面标出时区缩写（如「GMT+9」「PDT」）。
 * 空 → ''；解析不了的原样返回
 */
export function formatInTimeZone(
  value: unknown,
  pattern = 'YYYY-MM-DD HH:mm:ss',
  timeZone?: string | null,
  options: { withZone?: boolean } = {},
): string {
  if (value === null || value === undefined || value === '') return '';
  if (isDateOnly(value)) {
    const m = DATE_ONLY_RE.exec(value.trim())!;
    return formatParts({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: 0, minute: 0, second: 0 }, pattern);
  }
  const tz = effectiveTimeZone(timeZone);
  const date = parseDateTime(value, tz);
  if (!date) return String(value);
  const text = formatParts(zonedParts(date, tz), pattern);
  const withZone = options.withZone ?? true;
  if (withZone && /H/.test(pattern.replace(/\[[^\]]*]/g, '')) && !sameWallTime(tz, browserTimeZone(), date)) {
    return `${text} ${timeZoneAbbr(tz, date)}`;
  }
  return text;
}

const abbrFormatters = new Map<string, Intl.DateTimeFormat>();
/** 时区缩写（英文短名：GMT+9、PDT、UTC……）；取不到时给 UTC±HH:MM */
export function timeZoneAbbr(timeZone?: string | null, at: Date = new Date()): string {
  const tz = effectiveTimeZone(timeZone);
  try {
    let f = abbrFormatters.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' });
      abbrFormatters.set(tz, f);
    }
    const name = f.formatToParts(at).find((p) => p.type === 'timeZoneName')?.value;
    if (name) return name;
  } catch {
    // 退回偏移
  }
  return formatUtcOffset(timeZoneOffsetMinutes(at, tz));
}

/** 偏移（分钟）→ UTC+09:00 */
export function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** 时区的完整说明：Asia/Tokyo（UTC+09:00） */
export function timeZoneDescription(timeZone?: string | null, at: Date = new Date()): string {
  const tz = effectiveTimeZone(timeZone);
  return `${tz} (${formatUtcOffset(timeZoneOffsetMinutes(at, tz))})`;
}

/** 时刻 → 带该时区偏移的 ISO 8601（2026-10-23T13:03:00+09:00，秒以下舍去）：提交给后端的时刻 */
export function toOffsetIsoString(date: Date, timeZone?: string | null): string {
  const tz = effectiveTimeZone(timeZone);
  const offset = timeZoneOffsetMinutes(date, tz);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return `${formatParts(zonedParts(date, tz), 'YYYY-MM-DD[T]HH:mm:ss')}${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** 某时区的今天（YYYY-MM-DD） */
export function zonedToday(timeZone?: string | null, now: Date = new Date()): string {
  return formatParts(zonedParts(now, timeZone), 'YYYY-MM-DD');
}

/**
 * 流程等处的时刻 → 按界面语言显示「日期 + 时分」（timeZone 不传 = 浏览器时区）。
 * - 只有日期（YYYY-MM-DD，如预计送达日）原样显示，不按时区挪日期
 * - 不带时区的旧值按 timeZone 的墙上时间解释
 * - 解析不了的原样返回；空 → ''
 * - 浏览器不认识该语言时退回 YYYY-MM-DD HH:mm
 */
export function formatLocaleDateTime(value: string | Date | null | undefined, locale?: string | null, timeZone?: string | null): string {
  if (value === null || value === undefined || value === '') return '';
  if (isDateOnly(value)) return value.trim();
  const tz = effectiveTimeZone(timeZone);
  const date = parseDateTime(value, tz);
  if (!date) return String(value);
  try {
    return new Intl.DateTimeFormat(locale || undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: tz,
    }).format(date);
  } catch {
    return formatParts(zonedParts(date, tz), 'YYYY-MM-DD HH:mm');
  }
}

/** 时刻 → <input type="datetime-local"> 的值（timeZone 的墙上时间 YYYY-MM-DDTHH:mm）；不传 = 现在 */
export function toDateTimeLocalValue(date: Date = new Date(), timeZone?: string | null): string {
  return formatParts(zonedParts(date, timeZone), 'YYYY-MM-DD[T]HH:mm');
}

/** <input type="datetime-local"> 的值（timeZone 的墙上时间）→ 时刻；空 / 不合法 → null */
export function fromDateTimeLocalValue(value: string | null | undefined, timeZone?: string | null): Date | null {
  if (!value) return null;
  const m = NAIVE_DATETIME_RE.exec(String(value).trim());
  if (!m) return null;
  return zonedTimeToDate(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0), 0, timeZone);
}
