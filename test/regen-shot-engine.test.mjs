import test from 'node:test'
import assert from 'node:assert/strict'
import {registerProduceTools} from '../dist/tools/produce.js'

// 按镜指定视频引擎：model 只能在报价时给（凭证钉死引擎），生成工具不收 model。
function tools(){
 const m=new Map(); const calls=[]
 registerProduceTools({tool:(name,desc,schema,handler)=>m.set(name,{desc,schema,handler})},
  {producePost:async(path,body)=>{calls.push({path,body});return {ok:true}}})
 return {m,calls}
}
test('quote_regenerate_shot_video 收 model 并原样转发',async()=>{
 const {m,calls}=tools(); const t=m.get('quote_regenerate_shot_video')
 assert.ok(t.schema.model)
 assert.equal(t.schema.model.safeParse('hailuo-3').success,true)
 assert.equal(t.schema.model.safeParse('qa-other').success,false)
 await t.handler({storyboard_id:7,model:'hailuo-3'})
 assert.deepEqual(calls[0],{path:'/storyboards/7/regen/quote',body:{model:'hailuo-3'}})
})
test('不传 model 不带该键（跟随剧引擎，旧行为）',async()=>{
 const {m,calls}=tools()
 await m.get('quote_regenerate_shot_video').handler({storyboard_id:7})
 assert.deepEqual(calls[0].body,{})
})
test('regenerate_shot_video 不收 model（引擎由报价钉死）',()=>{
 const {m}=tools()
 assert.equal(m.get('regenerate_shot_video').schema.model,undefined)
 assert.match(m.get('quote_regenerate_shot_video').desc,/重新报价/)
})
