import test from 'node:test'
import assert from 'node:assert/strict'
import {registerProduceTools} from '../dist/tools/produce.js'

// 剧级帧链模式：update_project_settings 收 frame_chain_mode（off/strict/reframe）并原样转发到门面 PUT /dramas/:id。
function tools(){
 const m=new Map(); const calls=[]
 registerProduceTools({tool:(name,desc,schema,handler)=>m.set(name,{desc,schema,handler})},
  {producePut:async(path,body)=>{calls.push({path,body});return {ok:true}}})
 return {m,calls}
}
test('update_project_settings 收 frame_chain_mode 三个值，其余拒',()=>{
 const {m}=tools(); const s=m.get('update_project_settings').schema.frame_chain_mode
 assert.ok(s)
 for(const v of ['off','strict','reframe']) assert.equal(s.safeParse(v).success,true)
 for(const v of ['none','OFF','',null,0]) assert.equal(s.safeParse(v).success,false)
})
test('原样转发到 PUT /dramas/:id；不传不带该键（旧行为）',async()=>{
 const {m,calls}=tools(); const t=m.get('update_project_settings')
 await t.handler({drama_id:9,frame_chain_mode:'off'})
 assert.deepEqual(calls[0],{path:'/dramas/9',body:{frame_chain_mode:'off'}})
 await t.handler({drama_id:9,genre:'x'})
 assert.equal('frame_chain_mode' in calls[1].body,false)
})
test('描述讲清 off 的范围、改回才可 chain_frames、不自动重出；get_drama 指向回读字段',()=>{
 const {m}=tools()
 const d=m.get('update_project_settings').desc
 assert.match(d,/off=整剧不做/)
 assert.match(d,/chain_frames 要先改回 reframe\/strict/)
 assert.match(d,/不会自动重出已有帧/)
 assert.match(d,/strict=相邻缝只裸拷贝[^。]*首尾呼应仍按 reframe 重生/)  // PR#1222 Codex P2：strict 不拦 bookend，必须如实写
 assert.match(m.get('get_drama').desc,/frame_chain_mode/)
 assert.match(m.get('chain_frames').desc,/frame_chain_mode=off/)
 assert.equal(m.get('create_drama').schema.frame_chain_mode,undefined)
})
