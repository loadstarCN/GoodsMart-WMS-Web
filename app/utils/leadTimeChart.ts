export function leadTimeChart(items: any[], summary: any) {
  const keys = ['pick', 'pack', 'handover']
  const rows = items.map(row => {
    const lead = row.lead_hours || {}
    const complete = keys.every(key => typeof lead[key] === 'number' && lead[key] >= 0)
      && typeof lead.total === 'number' && Math.abs(keys.reduce((sum,key)=>sum+lead[key],0)-lead.total)<.001
    return {...row, complete, total: typeof lead.total === 'number' ? lead.total : null,
      segments: complete ? keys.map(key=>({key,hours:lead[key]})) : []}
  })
  const maximum = Math.max(24,...rows.map(row=>row.total||0),summary?.median_hours||0,summary?.p90_hours||0)
  return {rows, maximum, ticks:Array.from({length:5},(_,i)=>({hours:maximum*i/4,percent:i*25})),
    references:['median_hours','p90_hours'].filter(key=>summary?.[key]!=null).map(key=>({key,percent:summary[key]/maximum*100}))}
}
