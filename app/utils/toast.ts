/********************
 * Toast工具
 ​********************/
 // 工具库
import { toast } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';

export const showToast = (message: string, type: 'success' | 'error' | 'warning') => {
  toast[type](message, {
    theme: 'auto',
    icon: true,
    hideProgressBar: true,
    autoClose: true,
    position: 'top-right'
  });
};
