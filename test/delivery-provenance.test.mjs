import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer} from 'node:http'
import {createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {registerProduceTools} from '../dist/tools/produce.js'
const exec=promisify(execFile)
test('registration forwards frozen pack identity; acceptance requires explicit client statement',async()=>{
 const tools=new Map(),calls=[];registerProduceTools({tool:(n,d,s,h)=>tools.set(n,{s,h})},{producePost:async(path,body)=>{calls.push({path,body});return {ok:true}}})
 await tools.get('register_external_delivery').h({episode_id:1,file_url:'https://example.test/user-uploads/qa.mp4',handoff_pack_id:'qa-pack',handoff_manifest_sha256:'a'.repeat(64)})
 assert.equal(calls[0].body.handoff_pack_id,'qa-pack');assert.equal(calls[0].body.handoff_manifest_sha256,'a'.repeat(64))
 const confirm=tools.get('confirm_delivery_acceptance');assert(!confirm.s.confirm_client_statement.safeParse(false).success)
 await confirm.h({episode_id:1,delivery_id:null,client_accepted:true,confirm_client_statement:true,note:'QA customer statement'})
 assert.equal(calls[1].body.delivery_id,null);assert.equal(calls[1].path,'/episodes/1/delivery-confirmation')
})
test('output forbids saved music while legacy output retains it',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'delivery-music-'))
 const script=process.env.QA_HANDOFF_COMPILER_PATH||fileURLToPath(new URL('../assets/handoff/compile_timeline.py',import.meta.url))
 try{
  for(const policy of ['forbidden','unspecified']){
   const m={manifest_version:'0.1',render_target:{},audio_contract:{music_output:policy},shots:[{shot_number:1,clip:{file:'qa.mp4',duration_ms:2000,trim_head_ms:0}}],bgm:[{file:'saved.wav',anchor_shot:1}]}
   writeFileSync(join(dir,'manifest.json'),JSON.stringify(m));await exec('python3',[script,dir])
   const out=JSON.parse(readFileSync(join(dir,'build/offsets.json'),'utf8'))
   assert.equal(out.bgm.length,policy==='forbidden'?0:1);assert.equal(JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8')).bgm.length,1)
  }
 }finally{rmSync(dir,{recursive:true,force:true})}
})
test('download receipt binds actual bytes to export, rejects changed bytes and preserves ordinary LUT',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'delivery-receipt-')),bytes=Buffer.from('QA media bytes')
 let served=bytes;const sha=createHash('sha256').update(bytes).digest('hex'),server=createServer((q,res)=>res.end(served))
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 const script=fileURLToPath(new URL('../assets/handoff/fetch_pack.py',import.meta.url))
 try{
  const origin=`http://127.0.0.1:${server.address().port}`
  for(const expected of [sha,'f'.repeat(64)]){
   const m={manifest_version:'0.1',pack_id:'qa-pack',manifest_sha256:'a'.repeat(64),render_target:{color_lut:{haldclut_url:origin+'/lut'}},shots:[{shot_number:1,clip:{url:origin+'/clip',duration_ms:2000},provenance:{generation_sha256:expected}}]}
   const input=join(dir,'input.json'),out=join(dir,expected);writeFileSync(input,JSON.stringify(m))
   const run=exec('python3',[script,input,'-o',out],{env:{...process.env,NO_PROXY:'127.0.0.1',no_proxy:'127.0.0.1'}})
   if(expected===sha)await run;else await assert.rejects(run,/SHA-256/)
   const receipt=JSON.parse(readFileSync(join(out,'download-receipt.json'),'utf8'))
   assert.equal(receipt.pack_id,'qa-pack');assert.equal(receipt.status,expected===sha?'downloaded':'failed')
   if(expected!==sha){assert.equal(existsSync(join(out,'clips/shot_001.mp4')),false);m.shots[0].provenance.generation_sha256=sha;writeFileSync(input,JSON.stringify(m));await exec('python3',[script,input,'-o',out],{env:{...process.env,NO_PROXY:'127.0.0.1',no_proxy:'127.0.0.1'}});assert.equal(existsSync(join(out,'clips/shot_001.mp4')),true)}
   if(expected===sha){assert.equal(receipt.files.find(f=>f.file==='clips/shot_001.mp4').sha256,sha);assert.equal(JSON.parse(readFileSync(join(out,'manifest.json'),'utf8')).render_target.color_lut.file,'lut/haldclut.png')}
  }
 }finally{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true})}
})

test('image exports use a frozen server pack',async()=>{
 const ts=new Map(),calls=[];const frozen={media_type:'images',pack_id:'qa-pack',manifest_sha256:'a'.repeat(64),shots:[{shot_number:1,images:[{frame_type:'first_frame',url:'https://example.test/qa.png'}]}]};registerProduceTools({tool:(n,d,s,h)=>ts.set(n,h)},{produceGet:async p=>{calls.push(p);return frozen}})
 const m=JSON.parse((await ts.get('export_handoff_pack')({episode_id:1,media_type:'images'})).content[0].text);assert.equal(m.pack_id,'qa-pack');assert.deepEqual(calls,['/episodes/1/handoff-pack?media_type=images']);assert.equal(m.postproduction.workflow,'local_color')
})
