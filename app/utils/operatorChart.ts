export function operatorChart(data:any) {
  const items=(data.task_chart?.items||[]).filter((p:any)=>Number.isFinite(p.quantity)&&p.quantity>=0&&Number.isFinite(p.seconds)&&p.seconds>0)
  const nice=(n:number)=>{const magnitude=10**Math.floor(Math.log10(Math.max(1,n)));return Math.ceil(Math.max(1,n)/magnitude)*magnitude}
  const xMax=nice(Math.max(1,...items.map((p:any)=>p.quantity))*1.05)
  const yMax=nice(Math.max(1,...items.map((p:any)=>p.seconds/60))*1.05)
  const rate=data.task_chart?.median_per_hour
  const xEnd=rate>0?Math.min(xMax,yMax*rate/60):0
  const days:string[]=[]
  const start=Date.parse(data.start_date+'T00:00:00Z'),end=Date.parse(data.end_date+'T00:00:00Z')
  for(let stamp=start;Number.isFinite(stamp)&&stamp<=end&&days.length<366;stamp+=86400000)days.push(new Date(stamp).toISOString().slice(0,10))
  const stride=Math.max(1,Math.ceil(days.length/5))
  const daily:Record<string,Record<string,number>>={}
  for(const row of data.items||[])daily[row.operator_id]=Object.fromEntries((row.daily||[]).map((d:any)=>[d.date,d.quantity]))
  return {points:items.map((p:any)=>({...p,x:100*p.quantity/xMax,y:100-100*p.seconds/60/yMax})),
    xTicks:Array.from({length:6},(_,i)=>({value:xMax*i/5,percent:20*i})),
    yTicks:Array.from({length:5},(_,i)=>({value:yMax*i/4,percent:100-25*i})),
    median:rate>0?{x:100*xEnd/xMax,y:100-100*xEnd*60/rate/yMax}:null,
    operators:Array.from(new Map<number,any>([...items.flatMap((p:any)=>p.operators.map((o:any)=>[o.id,o])),...(data.items||[]).map((o:any)=>[o.operator_id,{id:o.operator_id,name:o.name}])]).values()),
    days,daily,dayTicks:days.map((date,i)=>({date,percent:100*(i+.5)/days.length,index:i})).filter(d=>d.index%stride===0)}
}
