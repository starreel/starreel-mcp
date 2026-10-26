import test from 'node:test'
import assert from 'node:assert/strict'
import {registerProduceTools} from '../dist/tools/produce.js'

// 单镜出帧的跨镜承接方式：quote_shot_frame / generate_shot_frame 收 continuity_mode 并原样转发到门面。
function tools(){
 const m=new Map(); const calls=[]
 registerProduceTools({tool:(name,desc,schema,handler)=>m.set(name,{desc,schema,handler})},
  {producePost:async(path,body)=>{calls.push({path,body});return {ok:true}}})
 return {m,calls}
}
test('两个工具都收 continuity_mode 三个值，其余拒',()=>{
 const {m}=tools()
 for(const name of ['quote_shot_frame','generate_shot_frame']){
  const s=m.get(name).schema.continuity_mode
  assert.ok(s,name)
  for(const v of ['auto','independent','follow_previous',undefined]) assert.equal(s.safeParse(v).success,true)
  for(const v of ['none','INDEPENDENT','',0]) assert.equal(s.safeParse(v).success,false)
 }
})
test('原样转发到门面 frame/quote 与 frame/generate',async()=>{
 const {m,calls}=tools()
 await m.get('quote_shot_frame').handler({storyboard_id:7,continuity_mode:'independent'})
 assert.equal(calls[0].path,'/storyboards/7/frame/quote')
 assert.equal(calls[0].body.continuity_mode,'independent')
 await m.get('generate_shot_frame').handler({storyboard_id:7,quote_id:'q',continuity_mode:'independent'})
 assert.equal(calls[1].path,'/storyboards/7/frame/generate')
 assert.equal(calls[1].body.continuity_mode,'independent')
})
test('描述讲清回执里的 continuity 与什么时候用 independent',()=>{
 const {m}=tools()
 assert.match(m.get('quote_shot_frame').desc,/follows_previous_shot/)
 assert.match(m.get('quote_shot_frame').desc,/continuity_mode:'independent'/)
 assert.match(m.get('generate_shot_frame').desc,/continuity_mode 须与报价时一致/)
})
