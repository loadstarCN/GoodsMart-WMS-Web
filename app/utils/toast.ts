/********************
 * Toast工具：旧页面的 showToast(message, type) 保留原来的写法，显示改用新界面的提示消息（utils/wToast、components/w/WToastHost）
 ​********************/
import { wToast } from './wToast'

export const showToast = (message: string, type: 'success' | 'error' | 'warning') => {
  wToast(message, type);
};
