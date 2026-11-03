const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
  const pe=await import('pe-library');
  const ico=fs.readFileSync(__dirname+'/assets/app.ico');
  const exe=pe.NtExecutable.from(fs.readFileSync(__dirname+'/release/win-unpacked/文章同步工作台.exe'));
  const resources=pe.NtExecutableResource.from(exe).entries.filter(e=>e.type===3);
  const count=ico.readUInt16LE(4);
  for(let i=0;i<count;i++){
    const offset=6+i*16,size=ico.readUInt32LE(offset+8),start=ico.readUInt32LE(offset+12);
    assert(resources.some(r=>Buffer.from(r.bin).equals(ico.subarray(start,start+size))),'Missing icon size '+i);
  }
  console.log('PASS: all '+count+' ICO images embedded in packaged executable');
})().catch(e=>{console.error(e);process.exitCode=1;});
