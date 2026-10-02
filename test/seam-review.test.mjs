import test from 'node:test'
import assert from 'node:assert/strict'
import {registerProduceTools} from '../dist/tools/produce.js'
test('explicit edit intent is advertised and forwarded without generation',async()=>{
 const tools=new Map(),calls=[]
 registerProduceTools({tool:(name,desc,schema,handler)=>tools.set(name,{desc,schema,handler})},{producePut:async(path,body)=>{calls.push({path,body});return {ok:true}}})
 const t=tools.get('update_shot')
 for(const value of ['continuous_action','shot_change','insert_detail','jump_cut'])assert(t.schema.continuity_intent.safeParse(value).success)
 assert(!t.schema.continuity_intent.safeParse('guess').success)
 await t.handler({storyboard_id:7,continuity_intent:'insert_detail'})
 assert.deepEqual(calls,[{path:'/storyboards/7',body:{continuity_intent:'insert_detail'}}])
 assert.match(tools.get('get_storyboards').desc,/seam_review.status/)
 assert.match(tools.get('get_storyboards').desc,/stale 是证据过期/)
})

test('audit-only defaults to free plan and forwards explicit billing acceptance',async()=>{
 const tools=new Map(),calls=[]
 registerProduceTools({tool:(name,desc,schema,handler)=>tools.set(name,{desc,schema,handler})},{producePost:async(path,body)=>{calls.push({path,body});return {ok:true}}})
 const t=tools.get('audit_seams');assert.match(t.desc,/estimated_points=null/)
 await t.handler({episode_id:7})
 await t.handler({episode_id:7,dry_run:false,confirm_usage_billing:true})
 assert.deepEqual(calls,[{path:'/episodes/7/audit-seams',body:{dry_run:true,confirm_usage_billing:false}},{path:'/episodes/7/audit-seams',body:{dry_run:false,confirm_usage_billing:true}}])
})
