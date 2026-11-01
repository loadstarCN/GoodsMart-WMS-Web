type LayoutShape = { name: string; x: number; y: number; width: number; height: number; rotation: number; target_id?: string; travel_seconds?: number; type?: string; code?: string; columns?: number | null; levels?: number | null }
type LayoutFloor = { name: string; width: number; height: number; objects: LayoutShape[] }

export function layoutGeometryIssue(floors: LayoutFloor[]): { name: string; reason: 'name' | 'size' | 'bounds' | 'connector' } | null {
  const number = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
  const name = (value: string) => typeof value === 'string' && !!value.trim() && value.length <= 80
  const rackCodes = new Set<string>()
  for (const floor of floors) {
    if (!name(floor.name)) return { name: floor.name, reason: 'name' }
    if (!number(floor.width, 1, 2000) || !number(floor.height, 1, 2000)) return { name: floor.name, reason: 'size' }
    for (const shape of floor.objects) {
      if (!name(shape.name)) return { name: floor.name, reason: 'name' }
      if (shape.type === 'rack') {
        if (shape.code) {
          const code = shape.code.trim()
          if (!code || code.length > 40 || rackCodes.has(code)) return { name: shape.name, reason: 'name' }
          rackCodes.add(code)
        }
        for (const value of [shape.columns, shape.levels]) {
          if (value != null && (!Number.isInteger(value) || !number(value, 1, 1000))) return { name: shape.name, reason: 'size' }
        }
      }
      if (!number(shape.x, 0, floor.width) || !number(shape.y, 0, floor.height)
        || !number(shape.width, 0.1, floor.width) || !number(shape.height, 0.1, floor.height)
        || shape.x + shape.width > floor.width + 1e-8 || shape.y + shape.height > floor.height + 1e-8
        || ![0, 90, 180, 270].includes(shape.rotation)) return { name: shape.name, reason: 'bounds' }
      if (shape.target_id && !number(shape.travel_seconds, 0, 86400)) return { name: shape.name, reason: 'connector' }
    }
  }
  return null
}
