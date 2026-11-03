module.exports=function installEditorNavigation(wc,{isVisible,confirmLeave}){
 wc.on('will-prevent-unload',event=>{
  // Electron otherwise silently cancels navigation when the editor has unsaved changes.
  // Never dismiss this protection automatically in a background synchronization page.
  if(isVisible()&&confirmLeave())event.preventDefault();
 });
};
