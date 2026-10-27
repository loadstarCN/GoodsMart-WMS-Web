/** Keep the form's chosen one-line address when the server would otherwise regenerate it. */
export function preserveAddressPatch(patch: Record<string, any>, record: Record<string, any>) {
  const addressFields = ['country', 'country_code', 'zip_code', 'admin_area', 'locality',
    'dependent_locality', 'address_line1', 'address_line2', 'organization', 'latin']
  if (!addressFields.some(key => Object.hasOwn(patch, key))) return patch
  const result: Record<string, any> = { ...patch, address: record.address ?? null }
  if (Object.hasOwn(record, 'address_en')) result.address_en = record.address_en ?? null
  return result
}
