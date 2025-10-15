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

export function formatDateTimeWithoutTimezone(
  inputDate: string | Date | null | undefined
): string | null {
  if (!inputDate) return null;

  try {
    // 统一转换为字符串处理
    let isoString: string;
    
    if (typeof inputDate === 'string') {
      // 验证字符串有效性
      const parsedDate = parseISO(inputDate);
      if (!isValid(parsedDate)) return null;
      isoString = inputDate;
    } else if (inputDate instanceof Date) {
      // 验证Date对象有效性
      if (!isValid(inputDate)) return null;
      isoString = inputDate.toISOString();
    } else {
      console.error('Unexpected date type:', typeof inputDate);
      return null;
    }

    // 使用正则表达式提取日期和时间部分
    const datetimeMatch = isoString.match(
      /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/
    );

    if (!datetimeMatch) {
      console.error('Invalid datetime format:', isoString);
      return null;
    }

    // 拼接为最终格式
    return `${datetimeMatch[1]}T${datetimeMatch[2]}`;
  } catch (error) {
    console.error('Datetime formatting failed:', error);
    return null;
  }
}