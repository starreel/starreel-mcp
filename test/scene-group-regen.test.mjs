import test from 'node:test'
import assert from 'node:assert/strict'
import {registerProduceTools} from '../dist/tools/produce.js'

function tools(){
 const m=new Map(); const calls=[]
 registerProduceTools({tool:(name,desc,schema,handler)=>m.set(name,{desc,schema,handler})},
  {producePost:async(path,body)=>{calls.push({path,body});return {ok:true}}})
 return {m,calls}
}
test('quote_regenerate_scene_group 收 shot_numbers + 可选 video_engine 并转发',async()=>{
 const {m,calls}=tools(); const t=m.get('quote_regenerate_scene_group')
 assert.equal(t.schema.video_engine.safeParse('hailuo-3').success,true)
 assert.equal(t.schema.video_engine.safeParse('qa-other').success,false)
 await t.handler({episode_id:3,shot_numbers:[1,2],video_engine:'wan3.0'})
 await t.handler({episode_id:3,shot_numbers:[1,2]})
 assert.deepEqual(calls.map(c=>[c.path,c.body]),[
  ['/episodes/3/scene-groups/regenerate/quote',{shot_numbers:[1,2],video_engine:'wan3.0'}],
  ['/episodes/3/scene-groups/regenerate/quote',{shot_numbers:[1,2]}]])
})
test('regenerate_scene_group 只收 quote_id（分组与引擎由报价钉死）',async()=>{
 const {m,calls}=tools(); const t=m.get('regenerate_scene_group')
 assert.equal(t.schema.video_engine,undefined); assert.equal(t.schema.shot_numbers,undefined)
 await t.handler({episode_id:3,quote_id:'q1'})
 assert.deepEqual(calls[0],{path:'/episodes/3/scene-groups/regenerate',body:{quote_id:'q1'}})
})
