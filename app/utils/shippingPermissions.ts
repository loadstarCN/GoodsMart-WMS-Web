/** Match the permissions on the shipping endpoints; workflow readiness alone is insufficient. */
export function shippingActionAllowed(key: string, hasPermission: (...permissions: string[]) => boolean): boolean {
  if (key === 'edit_packages') return hasPermission('packing_edit');
  if (['enter_tracking', 'complete_shipping', 'sign', 'refresh_tracking'].includes(key)) return hasPermission('delivery_edit');
  if (['create_waybill', 'cancel_waybill', 'dismiss_waybill', 'issue_documents', 'export_file', 'import_numbers', 'discard_export', 'book_pickup', 'record_pickup', 'cancel_pickup'].includes(key)) return hasPermission('packing_edit', 'delivery_edit');
  return ['print_label', 'open_tracking'].includes(key);
}
