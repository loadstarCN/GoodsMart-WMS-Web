import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

const reloadGuards = new Map<() => Promise<boolean>, () => void>()

/** Check drafts before warehouse reload or logout mutates the current session. */
export const confirmUnsavedFormsForReload = async () => {
 for(const guard of reloadGuards.keys())if(!await guard())return false
 for(const allowUnload of reloadGuards.values())allowUnload()
 return true
}

/** Preserve a local form draft until the user explicitly leaves or saves it. */
export const useUnsavedForm = (hasChanges: () => boolean, isSaving: () => boolean = () => false) => {
 const {t}=useI18n()
 let confirming:Promise<boolean>|null=null
 let reloadApproved=false
 const guard=async()=>{
  if(reloadApproved)return true
  if(!hasChanges())return true
  if(isSaving()){showToast(t('unsaved-form.saving'),'warning');return false}
  if(!confirming)confirming=showConfirm(t('unsaved-form.title'),t('unsaved-form.message'),t('unsaved-form.leave'),t('unsaved-form.stay'))
  try{return await confirming}finally{confirming=null}
 }
 const beforeUnload=(event:BeforeUnloadEvent)=>{if(!reloadApproved&&hasChanges()){event.preventDefault();event.returnValue=''}}
 onBeforeRouteLeave(guard)
 onBeforeRouteUpdate(guard)
 onMounted(()=>{window.addEventListener('beforeunload',beforeUnload);reloadGuards.set(guard,()=>{reloadApproved=true})})
 onBeforeUnmount(()=>{window.removeEventListener('beforeunload',beforeUnload);reloadGuards.delete(guard)})
}
