type Rack = {id:string;name:string;code:string;floor_name:string;columns?:number|null;levels?:number|null;location_ids?:number[]}
export function locationRackMatch(racks:Rack[], location:Record<string,any>) {
  const manual = location.map_rack_id && racks.find(rack=>rack.id===location.map_rack_id)
  if(location.map_rack_id&&!manual)return null
  const explicit = manual || racks.find(rack=>rack.location_ids?.includes(location.id))
  if(explicit)return {rack:explicit,column:location.rack_column||null,level:location.rack_level||null}
  const matches=racks.flatMap(rack=>{
    const prefix=rack.code+'-';if(!String(location.code||'').startsWith(prefix))return []
    const parts=location.code.slice(prefix.length).split('-')
    if(![1,2].includes(parts.length)||!parts.every((part:string)=>/^\d+$/.test(part)))return []
    const column=Number(location.rack_column||(parts.length===2?parts[0]:1)),level=Number(location.rack_level||parts.at(-1))
    return [{rack,column,level}]
  }).sort((a,b)=>b.rack.code.length-a.rack.code.length)
  const match=matches.length&&(!matches[1]||matches[0]!.rack.code.length>matches[1].rack.code.length)?matches[0]:null
  if(!match)return null
  const {rack,column,level}=match
  return Number.isSafeInteger(column)&&Number.isSafeInteger(level)&&column>0&&level>0&&(!rack.columns||column<=rack.columns)&&(!rack.levels||level<=rack.levels)?match:null
}
