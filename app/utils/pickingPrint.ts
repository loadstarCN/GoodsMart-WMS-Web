/** A complete route may reorder suggestions; incomplete maps always retain every row. */
export function pickingPrintPlan(source: any) {
  const stops = source?.stops || []
  const legs = source?.route?.legs || []
  const all = [...stops.flatMap((stop: any) => stop.items || []), ...(source?.unmapped || [])]
  const routed = source?.mode === 'suggestion' && !source.issue && !(source.unmapped || []).length
    && !(source.route?.unreachable || []).length && !!source.route?.returning
    && legs.length === stops.length && new Set(legs.map((leg: any) => leg.stop_id)).size === stops.length
    && legs.every((leg: any) => stops.some((stop: any) => stop.id === leg.stop_id))
  let rows: any[]
  if (routed) {
    rows = legs.flatMap((leg: any, index: number) => {
      const stop = stops.find((item: any) => item.id === leg.stop_id)
      return stop.items.map((row: any) => ({ ...row, stop: index + 1, floor: stop.floor_name,
        next_distance: (legs[index + 1] || source.route.returning).distance }))
    })
  } else {
    rows = all.slice().sort((a: any, b: any) =>
      (source.picking_sort==='manual'?((a.picking_order??Infinity)-(b.picking_order??Infinity)):0)
      || String(a.location).localeCompare(String(b.location),undefined,{numeric:true})
      || a.goods_id - b.goods_id || (a.lot_id || 0) - (b.lot_id || 0))
    const locations = new Map<number, number>()
    rows = rows.map((row: any) => {
      if (!locations.has(row.location_id)) locations.set(row.location_id, locations.size + 1)
      return { ...row, stop: locations.get(row.location_id) }
    })
  }
  return { mode: source.mode, rows, shortages: source.shortages || [], routed,
    distance: routed ? source.route.distance : null, transfers: routed ? source.route.transfers : null,
    version: routed ? source.version : null,
    station: routed ? source.stations?.find((station: any) => station.id === source.station_id)?.name : null }
}
