export function pdaManifestUrl(apkUrl: string, origin: string): string {
  if (!apkUrl || /[\\\x00-\x1f]/.test(apkUrl) || apkUrl.startsWith('//')) throw new Error('Invalid APK URL')
  const url = new URL(apkUrl, origin)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      (!apkUrl.startsWith('/') && !/^https?:\/\//.test(apkUrl))) throw new Error('Invalid APK URL')
  return new URL('gm_wms.json', url).href
}

export function parsePdaManifest(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid manifest')
  const data = input as Record<string, unknown>
  const rawVersion = data.version ?? data.versionName
  const version = typeof rawVersion === 'string' ? rawVersion.replace(/^v/, '') : ''
  if (!/^\d+(\.\d+){1,3}$/.test(version) || version.length > 50) throw new Error('Invalid version')
  const result: Record<string, string|number|null> = { version, versionCode: null, releaseDate: '', releasedAt: '', sizeBytes: null, sha256: '' }
  for (const [key, max] of [['versionCode', 2147483647], ['sizeBytes', 10737418240]] as const) {
    if (data[key] == null) continue
    if (!Number.isSafeInteger(data[key]) || Number(data[key]) < 1 || Number(data[key]) > max) throw new Error(`Invalid ${key}`)
    result[key] = Number(data[key])
  }
  if (data.sha256 != null) {
    if (typeof data.sha256 !== 'string' || !/^[a-f\d]{64}$/i.test(data.sha256)) throw new Error('Invalid SHA-256')
    result.sha256 = data.sha256.toLowerCase()
  }
  if (data.releasedAt != null) {
    if (typeof data.releasedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(data.releasedAt) || !Number.isFinite(Date.parse(data.releasedAt))) throw new Error('Invalid release time')
    result.releasedAt = data.releasedAt
    result.releaseDate = data.releasedAt.slice(0, 10)
    if (new Date(result.releaseDate).toISOString().slice(0,10) !== result.releaseDate) throw new Error('Invalid release date')
  } else if (data.releaseDate != null) {
    if (typeof data.releaseDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.releaseDate) || !Number.isFinite(Date.parse(data.releaseDate)) || new Date(data.releaseDate).toISOString().slice(0,10) !== data.releaseDate) throw new Error('Invalid release date')
    result.releaseDate = data.releaseDate
  }
  return result
}

export async function readPdaManifest(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, credentials: 'omit', redirect: 'error', cache: 'no-store' })
  if (!response.ok || !response.body) throw new Error('Manifest unavailable')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > 65536) throw new Error('Manifest too large')
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return parsePdaManifest(JSON.parse(new TextDecoder().decode(bytes)))
}
