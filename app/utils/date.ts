import { isValid, parseISO, formatISO, format } from 'date-fns';
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
 * 日期时间 → 不带时区的本地时间 YYYY-MM-DDTHH:mm:ss（后端按本地时间存，如签收时间）。
 * Date 对象按浏览器本地时间格式化（不能用 toISOString()：那是 UTC，东京 10:00 会变成 01:00）；
 * 不带时区的字符串原样当本地时间；带 Z / 偏移的字符串换算成本地时间。
 */
export function formatDateTimeWithoutTimezone(
  inputDate: string | Date | null | undefined
): string | null {
  if (!inputDate) return null;

  try {
    let parsedDate: Date;

    if (typeof inputDate === 'string') {
      // 验证字符串有效性（parseISO 对不带时区的字符串按本地时间解析）
      parsedDate = parseISO(inputDate);
    } else if (inputDate instanceof Date) {
      parsedDate = inputDate;
    } else {
      console.error('Unexpected date type:', typeof inputDate);
      return null;
    }

    if (!isValid(parsedDate)) return null;

    // 按本地时间输出，不带时区
    return format(parsedDate, "yyyy-MM-dd'T'HH:mm:ss");
  } catch (error) {
    console.error('Datetime formatting failed:', error);
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
