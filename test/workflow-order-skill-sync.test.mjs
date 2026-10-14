import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {WORKFLOW_HINT} from '../dist/tools/produce.js'

// 哨兵：SKILL.md 里每一处产线顺序描述都必须与 produce.ts 的 WORKFLOW_HINT 同向——
// 先分镜（纯文本步）再建定妆图/设定图（只给出场角色出图更省），再色彩脚本 → 场景图 → 帧 → 视频。
// 2026-10-14 PR#979 Codex 指出 SKILL.md 第 6 条写成「portraits + sheets → storyboards」，与 WORKFLOW_HINT 相反。
// 文档是第三方 agent 的操作手册，两处矛盾 = agent 按旧顺序给全部角色出图、多花钱。

// SKILL_SYNC_SKILL_PATH 只用于反向自检（把旧版 SKILL.md 喂进来确认哨兵会红），平时不设。
const SKILL=readFileSync(process.env.SKILL_SYNC_SKILL_PATH??new URL('../SKILL.md',import.meta.url),'utf8')

/** 依次在 text 里找 patterns，每个必须出现在前一个命中之后；缺一个或顺序颠倒都 fail。 */
function assertOrdered(text,patterns,label){
 let from=0
 for(const p of patterns){
  const re=new RegExp(p.source,p.flags.replace('g','')+'g'); re.lastIndex=from
  const m=re.exec(text)
  assert.ok(m,`${label}：在位置 ${from} 之后找不到 ${p}（要么缺了，要么排到了前面）`)
  from=m.index+m[0].length
 }
}
/** 箭头链：从 start 起到第一个句号为止（只看「A → B → C.」那一句，别让段落后文里的同名词把顺序检查放水）。 */
function chain(text,start,label){
 const s=text.search(start); assert.ok(s>=0,`${label}：找不到链首 ${start}`)
 const rest=text.slice(s); const e=rest.search(/\.(\s|$)/); assert.ok(e>0,`${label}：链没有句号收尾`)
 const c=rest.slice(0,e); assert.ok(c.includes('→'),`${label}：链里没有箭头`)
 return c
}
/** 取「从 start 起到 end 之前」的那一段；两头任一找不到即 fail（防止段落被改名后哨兵静默空转）。 */
function section(text,start,end,label){
 const s=text.search(start); assert.ok(s>=0,`${label}：找不到段首 ${start}`)
 const rest=text.slice(s); const e=rest.search(end); assert.ok(e>0,`${label}：找不到段尾 ${end}`)
 return rest.slice(0,e)
}

// ---- 真相源：WORKFLOW_HINT ②产线主干 ----
const HINT_MAIN=section(WORKFLOW_HINT,/②【产线主干/,/③【可选增强/,'WORKFLOW_HINT ②')
test('WORKFLOW_HINT ②产线主干：分镜 → 定妆图+设定图 → 色彩脚本 → 场景图 → 帧 → 尾帧 → 审帧 → 视频 → TTS → 成片',()=>{
 assertOrdered(HINT_MAIN,[/extract_assets/,/storyboards/,/review_storyboards/,/generate_portraits_and_sheets/,
  /generate_color_script/,/generate_scene_images/,/frames/,/tail_frame_plan/,/last_frame/,/review_frames/,/videos/,/generate_tts/,/compose/],'WORKFLOW_HINT ②')
})

// ---- SKILL.md 四处顺序描述，逐处对齐 ----
test('SKILL.md frontmatter description：extract → storyboards → portraits + sheets → frames',()=>{
 const fm=section(SKILL,/^---\n/m,/\n---\n/,'frontmatter')
 assertOrdered(fm,[/extract/,/storyboards/,/portraits \+ sheets/,/frames/,/video/,/final cut/],'frontmatter')
})
test('SKILL.md「What you produce」：storyboards → portraits_and_sheets → color_script → scene-images → frames → videos',()=>{
 const s=section(SKILL,/## What you produce/,/\n## /,'What you produce')
 assertOrdered(s,[/extract_assets/,/storyboards/,/review_storyboards/,/generate_portraits_and_sheets/,/generate_color_script/,/scene-images/,/frames/,/tail_frame_plan/,/videos/],'What you produce')
})
test('SKILL.md「Pipeline backbone」：storyboards → portraits → sheets → color script → scene images → frames → videos → TTS → compose',()=>{
 const s=section(SKILL,/2\. \*\*Pipeline backbone/,/\n3\. \*\*Optional boosts/,'Pipeline backbone')
 const c=chain(s,/quote-then-confirm\.\*\* /,'Pipeline backbone 链')
 assertOrdered(c,[/storyboards/,/portraits/,/character sheets/,/color script/,/scene images/,/frames/,/videos/,/TTS/,/compose/],'Pipeline backbone')
})
test('SKILL.md 第 6 条「Follow the pipeline order」：extract_assets → storyboards → portraits + sheets → frames → videos',()=>{
 const s=section(SKILL,/\n6\. \*\*Follow the pipeline order/,/\n7\. \*\*/,'discipline 6')
 const c=chain(s,/`set_script` →/,'discipline 6 链')
 assertOrdered(c,[/`set_script`/,/`rewrite_script`/,/`extract_assets`/,/storyboards/,/portraits/,/sheets/,/color script/,/scene images/,/frames/,/videos/],'discipline 6')
 // 要讲清「为什么分镜在前」且不许夸大：定妆图步对**所有未删角色**出图、不看分镜绑定（produce-facade charRows 只过滤 deletedAt），
 // 省钱路径是分镜后先 delete_character 删不出场角色。PR#984 Codex P2：第一版写成「只给出场角色出图」是不存在的过滤。
 // PR#984 Codex 第二轮 P2：needsPortrait 排除 char_type=voiceover（旁白/电话音），它们本就没有分镜绑定、配音还靠它——剪阵容只剪出镜角色。
 assert.match(s,/every\s+undeleted visual\s+character/i,'第 6 条须写明定妆图步对所有未删的出镜角色出图')
 assert.match(s,/`delete_character`/,'第 6 条须给出真实的省钱路径 delete_character')
 assert.match(s,/voice-only roles[\s\S]{0,80}voiceover/i,'第 6 条须写明画外音角色不出图、不能删')
 // PR#984 Codex 第五轮 P1：角色是剧级的，delete_character 删的是整剧——只看本集分镜不能判「不出场」。
 assert.match(s,/any\s+episode/i,'第 6 条须写明剪阵容按全剧判，不按本集')
 assert.match(s,/drama-wide/i)
})
test('SKILL.md 全文不再出现「sheets → storyboards」（定妆图排在分镜前）',()=>{
 assert.doesNotMatch(SKILL,/sheets\*{0,2} → storyboards/,'SKILL.md 仍有「定妆图在分镜前」的旧顺序')
 assert.doesNotMatch(SKILL,/portraits\*{0,2} → storyboards/)
})
test('两处都不许承诺「只给出场角色出图」（后端没有这个过滤）；WORKFLOW_HINT 写明对所有未删角色出图 + delete_character',()=>{
 assert.doesNotMatch(SKILL,/only (the )?characters who (actually )?appear/i,'SKILL.md 仍承诺不存在的出场角色过滤')
 assert.doesNotMatch(WORKFLOW_HINT,/只给出场角色/,'WORKFLOW_HINT 仍承诺不存在的出场角色过滤')
 assert.match(HINT_MAIN,/所有未删的出镜角色/)
 assert.match(HINT_MAIN,/delete_character/)
 assert.match(HINT_MAIN,/voiceover[\s\S]{0,60}别删/,'WORKFLOW_HINT 须写明画外音角色别删')
 const bb=section(SKILL,/2\. \*\*Pipeline backbone/,/\n3\. \*\*Optional boosts/,'Pipeline backbone')
 assert.match(bb,/every undeleted visual\s+character/i); assert.match(bb,/`delete_character`/)
 assert.match(bb,/voice-only roles[\s\S]{0,80}voiceover/i)
 assert.match(bb,/drama-wide, not per episode/i,'Pipeline backbone 须写明剪阵容是剧级的')
 assert.match(HINT_MAIN,/全剧任何一集都不出场/,'WORKFLOW_HINT 须写明按全剧判不出场')
})

// ---- 声线种子镜：generate_videos 无按镜参数，种子镜走单镜工具 ----
test('SKILL.md 与 WORKFLOW_HINT 都写明：声线种子镜用 quote_regenerate_shot_video → regenerate_shot_video，generate_videos 无按镜筛选',()=>{
 const d6=section(SKILL,/\n6\. \*\*Follow the pipeline order/,/\n7\. \*\*/,'discipline 6')
 assert.match(d6,/`generate_videos`[^.]*\b(no|has no|without)\b[^.]*(per-shot|shot filter|shot selection)/i,'第 6 条须写明 generate_videos 无按镜参数')
 assertOrdered(d6,[/`quote_regenerate_shot_video`/,/`regenerate_shot_video`/,/`set_voice_anchor_from_shot`/,/`generate_videos`/],'discipline 6 声线种子镜')
 const voice=section(SKILL,/No outside sample, but the film already has the voice/,/\n\n/,'SKILL voice anchor')
 assert.match(voice,/`regenerate_shot_video`/)
 const hintVoice=section(WORKFLOW_HINT,/【原声剧先锁声线/,/★世界观概念图/,'WORKFLOW_HINT 原声剧')
 assertOrdered(hintVoice,[/quote_regenerate_shot_video/,/regenerate_shot_video/,/generate_videos 没有按镜/,/set_voice_anchor_from_shot/],'WORKFLOW_HINT 原声剧种子镜')
})
