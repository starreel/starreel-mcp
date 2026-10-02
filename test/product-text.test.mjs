import test from 'node:test'
import assert from 'node:assert/strict'
import {registerProduceTools} from '../dist/tools/produce.js'
const contract={version:1,strategy:'generate_with_review',targets:[{asset_kind:'prop',asset_id:1,reference_url:'https://example.test/qa.png',region:{x:0,y:0,width:1,height:1},exact_text:'QA-01'}]}
test('explicit lettering contract and clear are forwarded unchanged',async()=>{
 const tools=new Map(),calls=[]
 registerProduceTools({tool:(name,desc,schema,handler)=>tools.set(name,{desc,schema,handler})},{producePut:async(path,body)=>{calls.push({path,body});return {ok:true}}})
 const t=tools.get('update_shot');assert(t.schema.product_text_contract.safeParse(contract).success)
 assert(!t.schema.product_text_contract.safeParse({...contract,targets:[]}).success)
 await t.handler({storyboard_id:7,product_text_contract:contract});await t.handler({storyboard_id:7,product_text_contract:null})
 assert.deepEqual(calls,[{path:'/storyboards/7',body:{product_text_contract:contract}},{path:'/storyboards/7',body:{product_text_contract:null}}])
})
test('human review requires explicit confirmation and exact artifact binding',async()=>{
 const tools=new Map(),calls=[]
 registerProduceTools({tool:(name,desc,schema,handler)=>tools.set(name,{desc,schema,handler})},{producePost:async(path,body)=>{calls.push({path,body});return {ok:true}}})
 const t=tools.get('record_product_text_review');assert.match(t.desc,/不得用模型判断冒充人工核对/)
 assert(!t.schema.confirm_visual_review.safeParse(false).success)
 const body={frame_type:'first_frame',generation_id:9,image_url:'https://example.test/qa.png',contract_hash:'qa-hash',passed:true,confirm_visual_review:true,note:'QA reviewed'}
 await t.handler({storyboard_id:7,...body});assert.deepEqual(calls,[{path:'/storyboards/7/product-text-review',body}])
})

test('uploaded originals use explicit media version without invented generation',async()=>{
 const tools=new Map(),calls=[]
 registerProduceTools({tool:(name,desc,schema,handler)=>tools.set(name,{desc,schema,handler})},{producePost:async(path,body)=>{calls.push({path,body});return {ok:true}}})
 const t=tools.get('record_product_text_review');assert(t.schema.generation_id.safeParse(null).success)
 const body={frame_type:'first_frame',generation_id:null,media_version:'qa-version',image_url:'https://example.test/upload.png',contract_hash:'qa-hash',passed:true,confirm_visual_review:true,note:'QA original checked'}
 await t.handler({storyboard_id:7,...body});assert.deepEqual(calls,[{path:'/storyboards/7/product-text-review',body}])
})
