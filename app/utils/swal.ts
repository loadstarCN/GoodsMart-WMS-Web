import 'sweetalert2/dist/sweetalert2.min.css';
import Swal from 'sweetalert2';

export const showConfirm = (
  title: string,
  text: string,
  confirmButtonText: string,
  cancelButtonText: string,
  options: {
    allowOutsideClick?: boolean
    reverseButtons?: boolean
  } = {}
) => {
  return Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    reverseButtons: options.reverseButtons ?? true,
    allowOutsideClick: options.allowOutsideClick ?? false,
    customClass: {
      confirmButton: 'btn btn-primary',
      cancelButton: 'btn btn-secondary'
    },
    buttonsStyling: false
  }).then((result) => result.isConfirmed);
};

export const showAlert = (title: string, text: string, icon: 'success' | 'error' | 'warning' | 'info') => {
    return Swal.fire({
        title: title,
        text: text,
        icon: icon,
        confirmButtonText: 'OK',
        customClass: {
            confirmButton: 'btn btn-primary'
        },
        buttonsStyling: false
    });
};
