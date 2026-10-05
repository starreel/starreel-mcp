import test from 'node:test'
import assert from 'node:assert/strict'
import { registerProduceTools } from '../dist/tools/produce.js'
function setup(result) {
 const calls=[], tools=new Map()
 registerProduceTools({tool:(name,desc,schema,handler)=>tools.set(name,{desc,handler})},{produceGet:async path=>{calls.push(path);return result},producePost:()=>{throw Error('write forbidden')}})
 return {tools,calls,run:async(name,args)=>JSON.parse((await tools.get(name).handler(args)).content[0].text)}
}
test('version history is read-only and preserves stale media and four independent facts',async()=>{
 const data={versions:[{url:'https://qa.invalid/old.mp4',state:{generated:true,input_consistent:false,review_valid:false,adopted:true,current_effective:false}}]}
 const s=setup(data)
 assert.deepEqual(await s.run('get_asset_versions',{storyboard_id:7}),data)
 assert.deepEqual(s.calls,['/storyboards/7/asset-versions'])
 assert.match(s.tools.get('get_storyboards').desc,/ready.*不代表当前有效/)
})
test('historical scene binding proposal never performs a write',async()=>{
 const data={applied:false,requires_review:true,proposals:[{storyboard_id:7,proposed_scene_id:null,reason:'ambiguous',candidates:[{id:1},{id:2}]}]}
 const s=setup(data)
 assert.deepEqual(await s.run('get_asset_binding_repair_plan',{episode_id:5}),data)
 assert.deepEqual(s.calls,['/episodes/5/asset-binding-repair-plan'])
})

test('retry diagnosis preserves evidence and performs only a free read', async()=>{
 const data={action:'reaudit_existing',evidenceIds:[12,13],threshold:2}
 const s=setup(data)
 assert.deepEqual(await s.run('get_frame_retry_diagnosis',{image_id:14}),data)
 assert.deepEqual(s.calls,['/images/14/diagnosis'])
 assert.match(s.tools.get('get_frame_retry_diagnosis').desc,/审计故障重审已有候选/)
})
