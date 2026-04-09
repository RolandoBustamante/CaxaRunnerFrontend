import Swal from "sweetalert2";

const base = {
  customClass: {
    popup:        "swal-popup",
    title:        "swal-title",
    htmlContainer:"swal-html",
    confirmButton:"swal-btn-confirm",
    cancelButton: "swal-btn-cancel",
    icon:         "swal-icon",
  },
  buttonsStyling: false,
  reverseButtons: true,
};

export function confirmDialog({ title, text, confirmText = "Confirmar", icon = "warning" }) {
  return Swal.fire({
    ...base,
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "Cancelar",
  }).then((r) => r.isConfirmed);
}

export function successDialog({ title, text }) {
  return Swal.fire({
    ...base,
    title,
    text,
    icon: "success",
    confirmButtonText: "OK",
    showCancelButton: false,
  });
}

export function errorDialog({ title, text }) {
  return Swal.fire({
    ...base,
    title,
    text,
    icon: "error",
    confirmButtonText: "OK",
    showCancelButton: false,
  });
}
