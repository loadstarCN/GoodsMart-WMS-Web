/** Payload snapshots may outlive their documents. Only recognized positive IDs form links. */
export function webhookReference(event: { event_type?: string; payload?: unknown }) {
  const kind = event.event_type?.split('.')[0]
  if (kind !== 'asn' && kind !== 'dn' && kind !== 'goods') return null
  const payload = event.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const data = payload as Record<string, unknown>
  const rawId = data[`${kind}_id`]
  if (typeof rawId !== 'number' && typeof rawId !== 'string') return null
  if (!/^[1-9]\d*$/.test(String(rawId))) return null
  const id = Number(rawId)
  if (!Number.isSafeInteger(id)) return null
  return { label: `${kind.toUpperCase()}-${id}`, to: `/${kind}/detail/${id}`, permission: `${kind}_read` }
}
