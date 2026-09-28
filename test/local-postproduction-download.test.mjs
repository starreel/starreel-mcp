import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { registerProduceTools } from '../dist/tools/produce.js'
const exec=promisify(execFile)
const localEnv={...process.env,NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost'}
test('MCP image export → download → local brief/comparison; originals preserved',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'local-color-'))
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')
 const server=createServer((req,res)=>{res.setHeader('Content-Type','image/png');res.end(bytes)})
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 try {
  const rows=[{id:1,storyboard_number:1,first_frame_image:`http://127.0.0.1:${server.address().port}/image.png`}]
  let handler;registerProduceTools({tool:(n,d,s,h)=>{if(n==='export_handoff_pack')handler=h}},{produceGet:async()=>rows})
  const manifest=JSON.parse((await handler({episode_id:1,media_type:'images',color_goal:'<script>bad()</script>'})).content[0].text)
  const input=join(dir,'input.json'),out=join(dir,'pack');writeFileSync(input,JSON.stringify(manifest))
  const script=fileURLToPath(new URL('../assets/handoff/fetch_pack.py',import.meta.url))
  await exec('python3',[script,input,'-o',out],{env:localEnv})
  const local=JSON.parse(readFileSync(join(out,'manifest.json'),'utf8'))
  assert.deepEqual(readFileSync(join(out,local.shots[0].images[0].file)),bytes)
  assert.ok(existsSync(join(out,'POSTPRODUCTION.md')));assert.ok(existsSync(join(out,'comparison.html')))
  assert.ok(existsSync(join(out,'source-manifest.json')));assert.ok(existsSync(join(out,'checksums.json')))
  assert.equal(local.postproduction.status,'downloaded_not_processed')
  const html=readFileSync(join(out,'comparison.html'),'utf8');assert.ok(!html.includes('<script>bad()'))
  await assert.rejects(exec('python3',[script,input,'-o',out],{env:localEnv}),/新的空目录/)
 } finally {await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true})}
})

test('video download retains timing/voice; local color skips LUT; failed download never claims completion',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'local-color-video-'));const requests=[]
 const server=createServer((req,res)=>{requests.push(req.url);if(req.url==='/missing'){res.statusCode=404;res.end();return}res.end('test-bytes')})
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 try {
  const url=`http://127.0.0.1:${server.address().port}`
  const source={manifest_version:'0.1',shots:[{shot_number:1,clip:{url:url+'/video',trim_head_ms:200,duration_ms:900},voice_track:{location:'baked_in_clip'},subtitle:{cues:[{start_ms:0,end_ms:300,text:'[字幕文本]'}]}}],render_target:{color_lut:{haldclut_url:url+'/lut'}}}
  let handler;registerProduceTools({tool:(n,d,s,h)=>{if(n==='export_handoff_pack')handler=h}},{produceGet:async()=>structuredClone(source)})
  const script=fileURLToPath(new URL('../assets/handoff/fetch_pack.py',import.meta.url))
  for(const mode of ['assembly','local_color']) {
   const result=JSON.parse((await handler({episode_id:1,purpose:mode})).content[0].text)
   const input=join(dir,mode+'.json'),out=join(dir,mode);writeFileSync(input,JSON.stringify(result));requests.length=0
   await exec('python3',[script,input,'-o',out],{env:localEnv})
   const local=JSON.parse(readFileSync(join(out,'manifest.json'),'utf8'))
   assert.equal(local.shots[0].clip.trim_head_ms,200);assert.equal(local.shots[0].voice_track.location,'baked_in_clip')
   assert.ok(readFileSync(join(out,local.shots[0].subtitle.file),'utf8').includes('00:00:00,300'))
   assert.equal(requests.includes('/lut'),mode==='assembly')
   assert.equal(existsSync(join(out,'comparison.html')),mode==='local_color')
  }
  const broken=JSON.parse((await handler({episode_id:1,purpose:'local_color'})).content[0].text)
  broken.shots[0].clip.url=url+'/missing';const input=join(dir,'bad.json'),out=join(dir,'bad');writeFileSync(input,JSON.stringify(broken))
  await assert.rejects(exec('python3',[script,input,'-o',out],{env:localEnv}),/下载失败/)
  assert.equal(existsSync(join(out,'comparison.html')),false)
  assert.equal(JSON.parse(readFileSync(join(out,'manifest.json'),'utf8')).postproduction.status,'not_processed')
 } finally {await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true})}
})
