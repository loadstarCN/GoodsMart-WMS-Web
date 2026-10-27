export function stockTrendChart(rows: {date:string;total:number;coverage?:string}[]) {
  const known = rows.filter(row => row.coverage !== 'none' && Number.isFinite(row.total))
  if (!known.length) return null
  const max = Math.max(1,...known.map(row=>row.total)), min = Math.min(0,...known.map(row=>row.total))
  const segments = rows.map((row,index)=>row.coverage==='none'||!Number.isFinite(row.total)?null:
    ({...row,x:rows.length===1?300:index/(rows.length-1)*600,y:160-(row.total-min)/(max-min)*140}))
  return {max,min,points:segments.filter(point=>point!==null),
    line:segments.map((point,index)=>point?((index>0&&segments[index-1]?'L':'M')+point.x+' '+point.y):'').join(' '),
    last:rows.at(-1)?.coverage==='none'?null:rows.at(-1)?.total??null}
}
