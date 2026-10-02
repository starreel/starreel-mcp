import test from 'node:test'
import assert from 'node:assert/strict'
import {registerProduceTools} from '../dist/tools/produce.js'
test('cost attribution and explicit classification keep ledger facts intact',async()=>{
 const registry=new Map(),calls=[];registerProduceTools({tool:(n,d,s,h)=>registry.set(n,{s,h})},{produceGet:async p=>{calls.push(p);return {available:false,totals:null}},producePost:async(p,b)=>{calls.push({p,b});return {ok:true}}})
 const report=JSON.parse((await registry.get('get_cost_attribution').h({drama_id:1})).content[0].text);assert.equal(report.totals,null);assert.deepEqual(calls,['/dramas/1/cost-attribution'])
 const write=registry.get('classify_cost_reason');assert(!write.s.category.safeParse('waste').success);assert(!write.s.note.safeParse('').success)
 await write.h({drama_id:1,ledger_id:2,category:'platform_repair',note:'QA verified reason'});assert.deepEqual(calls[1],{p:'/dramas/1/cost-attribution/2/reason',b:{category:'platform_repair',note:'QA verified reason'}})
})
