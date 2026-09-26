/**
 * 功能地图 —— 单一真相源。三个消费方都从这里取数：
 *   · index.ts 的 server 级 instructions(客户端 initialize 时拿到、通常注入系统提示);
 *   · get_capabilities_guide 工具(agent 主动查"你们能做什么/客户这种材料该走哪条通道");
 *   · 后端哨兵测试(引导里提到的每个工具名都必须真的注册了,工具改名/下线时测试会红,
 *     引导不会悄悄指向不存在的工具)。
 *
 * 为什么要有它:124 个工具各自的描述都很详细,但 agent 拿到工具清单后并不知道
 * 「客户手上这种材料该走哪条通道」(格式范本 / 分镜表直通道 / 自有素材上传 / 交接包 …),
 * 于是永远只走 set_script → rewrite_script 一条路——客户交的是成品分镜表也被改写成散文。
 * 工具描述回答"这个工具做什么",本文件回答"什么情况下该用哪个"。
 *
 * ★本文件不 import SDK、不联网、不读环境,后端测试可直接 import。
 * ★列表字段(use / tools / run / fix)里每一项以**工具名开头**,括号里写关键参数;
 *   散文字段里的工具名用反引号包住——referencedTools() 靠这两条约定抽名字。
 */
export const GUIDE_VERSION = '2026-09-25'

export interface EntryPoint {
  /** 客户手上有什么(判别条件) */
  customer_has: string
  /** 按序调用的工具;括号里是关键参数/要点 */
  use: string[]
  /** 别走哪条路、为什么 */
  avoid?: string
  /** 一句话补充 */
  note?: string
  /** 全程免费 */
  free?: boolean
  /** instructions 里的一行版流程;不填则按 use 顺序用 → 串起来(有分支/并列的入口必须填,否则读起来像顺序链) */
  flow?: string
}

/** 按客户手上的材料选入口——这是 agent 最常缺的那张表。 */
export const ENTRY_POINTS: EntryPoint[] = [
  {
    customer_has: '小说 / 故事大纲 / 梗概(还不是剧本形态)',
    use: [
      'create_drama(建剧即设好 setting_brief/画幅/video_engine/image_model 等免费地基,别建空壳)',
      'set_script',
      'rewrite_script(auto 路由→创作型改写:AI 铺钩子与情感点)',
      'review_script',
    ],
    note: '改写成功一次后所有修改只走 `edit_rewritten_script` 点改,别重跑 `rewrite_script`(整篇重来,已改好的地方会退回)。',
  },
  {
    customer_has: '已写好的剧本(有场景头 + 对白行结构)',
    use: [
      'set_script',
      'rewrite_script(auto 路由→两步保真:台词逐句机器锁定、AI 不加戏)',
      'get_script(dramaturgy_suggestions 是 AI 识别到但没自动补的剧作缺口,转述给客户定)',
      'review_script',
    ],
    note: '客户要求逐句保留 → `update_project_settings` 设 rewrite_pipeline=two_pass + fidelity_enforce=1。改写仍是必经步:把稿子直接塞进 `edit_rewritten_script` 会 400。',
  },
  {
    customer_has: '想拿到别的 AI 平台自己改写 / 反馈「你们的 AI 改动太大」',
    use: [
      'get_script_format_spec(把 external_prompt + filled_example + markdown 连同原稿一起交给那个平台;务必带 filled_example)',
      'check_script_format(拿回整理稿先自查;errors 清零再往下;免费可反复跑)',
      'adopt_external_script(出口 A:外部稿含制作层标注 → 直接采用为可拍稿,我方 AI 不介入、秒级、不计费)',
      'set_script(出口 B:外部只做了剧情层 → 灌回原稿位,再 rewrite_script 走保真两步补标注)',
    ],
    avoid: '别把外部整理稿塞进 `edit_rewritten_script`(未跑过改写会 400);也别跳过 `check_script_format` 直接灌——格式不合规照样被闸拦,白跑一轮。',
    free: true,
    flow: 'get_script_format_spec → 交给外部平台改 → check_script_format(errors 清零) → 出口A adopt_external_script(含标注·直接采用·免费) 或 出口B set_script + rewrite_script(只有剧情层·平台补标注)',
  },
  {
    customer_has: '做完的成品分镜表(逐镜写了秒数 / 景别 / 运镜;常见于样片、交给电视台或品牌方的表)',
    use: [
      'get_storyboard_table_spec(先取契约:景别/运镜白名单、正文落点、字卡语法、给外部 AI 的提示词与成品示例)',
      'check_storyboard_table(导入前自检:与导入同一个解析器,errors 清零、warnings 逐条看——缺秒数/景别没认出/没画面叙述都会原样建进去)',
      'import_storyboard_table(不传 content 则读本集原始内容;本集已有分镜要 confirm_replace:true)',
    ],
    avoid: '绝不走 set_script→rewrite_script→generate_storyboards:改写会把秒数/景别/运镜/STYLE/字卡当非剧情内容剥掉(生产实测 8 镜 36 秒被拆成 20 镜 109 秒)。',
    note: '导入默认带 auto_complete(后台 AI 填专业字段 + 把每镜基础描述扩写成出图/视频提示词,文本步后付、调用前告知客户;auto_complete:false 只导入)——回执 started 后用 `get_autofill_status` 轮询到 done 再 `review_storyboards`;`[字卡 9s] 行一 | 行二` 会建成卡镜(成片层直接渲,不出图不出视频)。',
    free: false,
    flow: 'get_storyboard_table_spec → 外部工具按范本整理 → check_storyboard_table(errors 清零) → import_storyboard_table(默认 auto_complete) → get_autofill_status 到 done → review_storyboards',
  },
  {
    customer_has: '结构化数据(客户自己的工具 / 表格导出 / 第三方 AI 直接产 JSON,想一次建好本集分镜;角色/场景/道具仍由 extract_assets 提取)',
    use: [
      'get_bulk_import_spec(契约 + 模板 + 成品示例 + 枚举与上限,与校验器同源)',
      'check_bulk_import(同一份 zod 校验;引用不到的角色/场景、死镜、台词里的舞台指示都会报出来)',
      'bulk_import_storyboards(只建分镜、不建角色/场景/道具——先 extract_assets 再导,导入按名字绑定已有的;mode=merge 更新/保留,replace 替换全部需客户明确同意;自带的 image_prompt/video_prompt 逐字照用,没填的镜平台拼基础描述)',
    ],
    avoid: '别把 JSON 转成文本再走 import_storyboard_table,也别一条条 update_shot 手建——结构化数据就走结构化通道。',
    note: '自带 image_prompt/video_prompt 会逐字保留(只有 frame_visual_contract 这个内部帧契约被忽略),没填的镜平台拼基础描述;导入默认带 auto_complete(后台 AI 填专业字段,并只给平台拼基础描述的镜扩写出图/视频提示词,文本步后付、调用前告知客户)——回执 started 后 `get_autofill_status` 轮询到 done 再 `review_storyboards`。',
    free: false,
    flow: 'get_bulk_import_spec → check_bulk_import(errors 清零) → bulk_import_storyboards(默认 auto_complete) → get_autofill_status 到 done → review_storyboards',
  },
  {
    customer_has: '自有的定妆图 / 场景图 / 道具图 / 镜头图(客户真实素材)',
    use: [
      'upload_image',
      'set_character_portrait(须单人·单张单角度·无文字;换图后按 next_step 重出设定图,stale_frames 是要逐镜重生的镜)',
      'upload_scene_image(须空景无人·无叠加文字)',
      'upload_prop_sheet',
      'upload_shot_frame(只用于客户自有真实素材)',
      'upload_shot_footage(客户自有整段视频当某镜成片:录屏/产品实拍/已有片段;登记后该镜不再 AI 出图出视频,终拼原样用,时长按素材回写;清除用 clear_shot_footage)',
    ],
    avoid: '要「改某一镜画面」走 `generate_shot_frame`(平台自动带该镜身份锚·场景道具参考·画风锚);别在外部工具画好再 `upload_shot_frame`——外部图没有任何锚,人物/服装/画风必漂。',
    flow: 'upload_image · set_character_portrait · upload_scene_image · upload_prop_sheet · upload_shot_frame(仅客户自有素材;要改画面走 generate_shot_frame) · upload_shot_footage(整段实拍/录屏当某镜成片)',
  },
  {
    customer_has: '自己的声音样本 / 指定音色',
    use: [
      'clone_voice(需客户对该声音有授权;按音色计费,失败自动退)',
      'speak_with_voice(任意文本试听)',
      'list_voices',
      'set_character_voice(绑到角色;传 voice_id 如 lib:12)',
      'assign_voices',
    ],
    note: '所有项目默认视频原声(use_clip_audio=true,跳过 TTS);要配音把它设 false,并主动告诉客户可切换。' +
      '★原声剧里 set_character_voice 绑客户自己的授权音色 = 锁声线:之后出的视频把它交给厂商当参考音频,前后镜声线一致;' +
      '代价是该角色的镜不再喂定妆视频锚、身份靠定妆图/设定图。只对绑定之后出的视频生效——先绑再出视频;' +
      '已出好的视频用 repair_episode_dialogue(only_flagged=false)换轨统一,别整集重生。',
    flow: 'clone_voice → speak_with_voice(试听) → set_character_voice(原声剧:在 generate_videos 之前) / assign_voices',
  },
  {
    customer_has: '没有外部音源,想用片子里某个角色已经念出来的声音当基准',
    use: [
      'set_voice_anchor_from_shot(从本剧某一镜选定角色声线;免费;选该角色独自说话、台词较长、无配乐的镜)',
      'get_pipeline_status(native_voice_anchor:unanchored_speakers=还没锁的角色,stale_shots=锁之前出的、要重出的镜)',
      'regenerate_shot_video(重出 stale_shots)',
    ],
    note: '原声剧里这就是锁声线:之后出的视频把这段声音交给厂商当参考音频。只对之后出的视频生效——' +
      '最省的顺序是每个说话角色先出一镜、选定声线,再批量出其余镜。',
    flow: 'generate_videos(每个说话角色先出一镜) → set_voice_anchor_from_shot → generate_videos(其余镜) → get_pipeline_status 看 stale_shots',
  },
  {
    customer_has: '歌曲 + 歌词(MV)',
    use: [
      'create_drama(project_type=mv)',
      'set_mv_lyrics',
      'generate_mv_story',
      'generate_mv_script',
      'get_mv',
    ],
    note: 'MV 不走标准 `rewrite_script`(会被拦),之后回到 extract_assets → 分镜 → 出图的标准链。',
  },
  {
    customer_has: '产品 / 品牌(广告、品牌微电影)',
    use: [
      'create_drama(project_type=ad 或 brand_film)',
      'add_product',
      'generate_product_sheet',
      'list_products',
      'render_multi_aspect(成片一源多画幅)',
    ],
    note: '广告改写自动走广告改写 agent;文字卡/品牌文案别写成台词(会被念出来)。',
  },
  {
    customer_has: '已生成的镜头 / 成片要改(改台词、裁剪、拆镜、重生某镜、换引擎)',
    use: [
      'scan_dialogue_coverage(先定病因:话没说完/念错/走到别的镜;免费)',
      'scan_intra_shot_cuts(「切太快」先看厂商有没有在单镜内自行硬切;免费)',
      'get_shot_prompts(读某镜的出图/视频提示词正文,免费;改提示词前先读现值)',
      'update_shot(景别/动作/台词/运镜等文本字段;image_prompt/video_prompt 提示词正文;character_ids 全量覆盖)',
      'replace_shot_dialogue',
      'repair_episode_dialogue(换音频不重生视频,按 TTS 费率,比重生便宜几个数量级)',
      'split_shot',
      'trim_shot',
      'recommend_trim_window',
      'regenerate_shot_video',
      'edit_video_shot(就地编辑;get_edit_capabilities 先看当前引擎支持什么)',
      'rerender_episode(改完后免费重拼)',
    ],
    note: '改了台词而视频已存在 → 视频仍念旧词,必须 `regenerate_shot_video`,重拼救不了。',
    flow: 'scan_dialogue_coverage / scan_intra_shot_cuts 先定病因 → update_shot / replace_shot_dialogue / repair_episode_dialogue / split_shot / trim_shot / regenerate_shot_video / edit_video_shot → rerender_episode',
  },
  {
    customer_has: '想自己剪:要逐镜素材包(裸片 / 对白轨 / 音效 / 配乐 / 字幕)',
    use: ['export_handoff_pack', 'get_handoff_toolchain', 'save_handoff_toolchain'],
    note: '与 `compose_episode` 二选一。★人声在哪要**逐镜**看 voice_track.location——整集的 audio_contract.mode 只是声明,' +
      '不是逐镜真值(全画外旁白镜的旁白是平台在完成侧混进裸片的);逐句核对看 spoken_lines,有字幕不等于有声音。' +
      '完整流程见 local_postproduction 段。',
  },
  {
    customer_has: '多语言发行',
    use: ['translate_subtitles', 'update_project_settings(subtitle_secondary_lang 双语烧录 / subtitle_translation_only 仅译文)'],
  },
]

export interface PipelineStep {
  step: string
  tools: string[]
  billing: '免费' | '文本按 token 后付' | '报价确认后扣点' | '混合'
  gate?: string
  note?: string
}

/** 10 步产线(与 get_pipeline_status 的步序一致;不跳步)。 */
export const PIPELINE: PipelineStep[] = [
  {
    step: '1 建剧与项目设定',
    tools: ['list_project_options', 'create_drama', 'update_project_settings'],
    billing: '免费',
    note: 'setting_brief(世界观/ERA LOCK)、画幅、video_engine、image_model、cinematography_prompt/art_bible/visual_lock 都在这一步定;收费步前服务端会要求 setting_brief≥30 字 + aspect_ratio。',
  },
  {
    step: '2 灌本',
    tools: ['set_script', 'import_storyboard_table(直通道:已有分镜表;先 get_storyboard_table_spec + check_storyboard_table)', 'bulk_import_storyboards(直通道:结构化 JSON;先 get_bulk_import_spec + check_bulk_import)', 'adopt_external_script(直通道:外部按范本产出的稿)'],
    billing: '免费',
  },
  {
    step: '3 AI 改写',
    tools: ['rewrite_script', 'get_script', 'edit_rewritten_script'],
    billing: '文本按 token 后付',
    gate: 'review_script(改写稿审查;免费;extract_assets / generate_storyboards 前必过)',
    note: '典型 2~4 分钟;60 秒内查不到不是失败,用 `get_run_status` 判断。',
  },
  {
    step: '4 提取资产(角色/场景/道具)',
    tools: ['extract_assets', 'get_characters', 'get_scenes', 'get_props', 'update_character', 'update_scene', 'update_prop', 'create_prop', 'mark_signature_prop'],
    billing: '文本按 token 后付',
    note: '角色外观唯一真相源 = 人物档案(`update_character` 改;客户确认后 profile_locked=1 锁定);别把角色外观写进 visual_lock/art_bible。',
  },
  {
    step: '5 拆镜(纯文本,先于任何出图)',
    tools: ['quote_storyboards', 'generate_storyboards', 'get_storyboards', 'get_health_report', 'autofill_storyboards', 'enhance_shot_prompts', 'complete_ending_motifs'],
    billing: '报价确认后扣点',
    gate: 'review_storyboards(分镜审查;免费;generate_frames 前必过)',
    note: '每镜 5-7 秒是对 AI 出视频优化的正常时长,别因「镜偏长」重拆;`generate_storyboards` 替换整集分镜,已有分镜需 confirm_replace。',
  },
  {
    step: '6 剧目级一致性资产(分镜后、出图前)',
    tools: [
      'generate_portraits_and_sheets(定妆图+设定图,一致性锚·两者都要:调一次推进一步,定妆图齐了再调一次出设定图)', 'quote_character_portraits(只报定妆图;设定图无需报价)',
      'generate_world_concept(默认必做,仍走报价)', 'generate_motion_templates', 'generate_color_script',
      'generate_art_bible', 'extract_visual_lock', 'extract_setting_brief', 'generate_video_style',
      'quote_scene_images', 'generate_scene_images', 'generate_prop_sheet',
      'get_scene_prompt(读某场空景图的提示词正文,免费)', 'update_scene(image_prompt 改正文)', 'regenerate_scene_image(单场重出)',
    ],
    billing: '报价确认后扣点',
    note: '分镜后建只给出场角色出图更省;动作模板本就必须分镜后。' +
      '★色彩脚本(generate_color_script)与动作模板(generate_motion_templates)是主干步不是增强项:' +
      '出图/出视频按它们注入调色与运动提示,缺了静默不注入、不报错;两者是文本步无 quote_*,按用量后付。' +
      '★这一步的两个锚缺一不可:定妆图锚人(generate_portraits_and_sheets)、空景基板锚景(generate_scene_images)。' +
      '基板长期被第三方漏掉——跳过不报错、不被拦,但每个场景的第一镜会完全没有背景锚' +
      '(平台的兜底补图只惠及同场景后续镜),而首镜往往定调。',
  },
  {
    step: '7 出帧(镜头图)',
    tools: ['run_precheck(免费,揪出必被厂商拒的镜)', 'quote_frames', 'generate_frames', 'tail_frame_plan(免费,首帧出完必调)', 'quote_shot_frame', 'generate_shot_frame(单镜重生)', 'chain_frames', 'upload_shot_frame'],
    billing: '报价确认后扣点',
    gate: 'review_frames(镜头图审查;免费;generate_videos 前必过)',
    note: '★出帧是**两趟**:generate_frames 默认只出首帧,首帧出完必须调一次免费的 `tail_frame_plan` ' +
      '——它告诉你哪几镜需要独立尾帧(末态≠首态,判据在平台侧,你猜不出来),再 frame_type=last_frame 补上。' +
      '生产实测 32 集里 30 集整集只出了首帧,其中 23 集一路出完了视频;那些镜出视频时只有首帧一个锚,末态由模型自由发挥。' +
      'pending=还在生成,别重复调 `generate_frames`(重复扣费)。' +
      '★开跑前用 `get_pipeline_status` 核对 generate_scene_images 的 completed/total——缺基板照样能出帧,' +
      '但背景从每个场景的首镜起就开始漂;`review_storyboards` 也会把缺口报成 scene_plate_missing。',
  },
  {
    step: '8 出视频',
    tools: ['quote_videos', 'generate_videos', 'get_scene_group_plan', 'generate_scene_groups', 'quote_regenerate_shot_video', 'regenerate_shot_video', 'quote_edit_video_shot', 'edit_video_shot', 'upload_shot_footage(实拍素材镜:客户录屏/产品实拍直接当该镜视频,不出视频不扣费)', 'get_edit_capabilities'],
    billing: '报价确认后扣点',
    note: 'video_engine 必须在出视频前定(seedance-2.5 默认 / hailuo-3 降本 / wan3.0 风格化·绝不用于写实真人);切换不回溯已生成镜头。',
  },
  {
    step: '9 音频',
    tools: ['assign_voices', 'generate_tts(仅 use_clip_audio=false)', 'clone_voice', 'generate_bgm', 'get_bgm_status', 'generate_sfx', 'lipsync_shot', 'lipsync_episode', 'get_lipsync_status', 'set_shot_name_card'],
    billing: '混合',
    note: '默认视频原声跳过 TTS 三步(pipeline-status 里显示 not_required,不是没做完)。',
  },
  {
    step: '10 成片与交付',
    tools: ['compose_episode', 'get_final_cut', 'get_export', 'rerender_episode', 'get_deliverables', 'generate_deliverables', 'render_multi_aspect', 'generate_effects', 'generate_transitions', 'generate_episode_poster', 'generate_drama_poster', 'generate_cover', 'translate_subtitles', 'get_pipeline_status'],
    billing: '免费',
    note: '终拼免费(ffmpeg+COS);成片前用 `get_pipeline_status` 确认没有缺镜;配乐晚于成片(bgm_stale)重新 compose 即可。',
  },
]

export const REVIEW_GATES = [
  { after: '改写稿产出', run: 'review_script', before: ['extract_assets', 'generate_storyboards'] },
  { after: '分镜产出', run: 'review_storyboards', before: ['generate_frames'] },
  { after: '镜头图产出', run: 'review_frames', before: ['generate_videos'] },
] as const

export const REVIEW_GATE_RULE =
  '三道闸全部免费、服务端强制(跳过 → 400)。每次审查返回 review_token,把它随下游收费工具一起传;' +
  'findings 逐条原样告诉客户(code=问题类型 · shots=命中镜号 · action=该调哪个工具修),按 action 修完复审再走。' +
  '审查后又改了内容 → token 自动失效,复审一次即可。有 error 时默认拦截;只有客户知情并坚持才带 acknowledge_review:true——不要替客户做这个决定。' +
  '`review_all` 是整集体检、不发 token。'

export interface QaTool { symptom: string; run: string; then: string[] }
export const QA_TOOLS: QaTool[] = [
  { symptom: '话没说完就切 / 台词跑到别的镜上', run: 'scan_dialogue_coverage', then: ['repair_episode_dialogue(首选:换音频不重生,便宜)', 'regenerate_shot_video(特写镜或画面也错时)', 'compose_episode'] },
  { symptom: '切太快 / 一个镜头里画面跳来跳去', run: 'scan_intra_shot_cuts', then: ['update_project_settings(video_engine 改 seedance-2.5 或 hailuo-3)', 'regenerate_shot_video'] },
  // 「动作太慢」的判据全部来自实测(同剧同镜多版对照):删 slow/缓慢这类措辞没有可测效果;
  // 远景镜的运动量整体只有中景的几分之一;把更多节拍放进同样秒数才真的更有动感。
  // ★只作为逐镜修法给 agent,平台默认拆镜规则不在这里改(等运动量基线攒够再裁决)。
  { symptom: '动作太慢 / 没演出来 / 像快进', run: 'get_shot_prompts(先读 video_prompt 与 first_frame_prompt,看首帧画的是哪一刻)', then: [
    'update_shot(shot_type:远景/全景演不出表情、手部这类细微动作——要看清就改成中景或更近,再 generate_shot_frame 重出首帧;这是分镜问题,改措辞没用)',
    'update_shot(video_prompt:按节拍写——约 5 秒写 3 拍、3 秒写 2 拍,「第一拍…第二拍…第三拍…」,让这几秒里发生更多事;只删 slow/缓慢/轻轻这类词实测没有效果;动作必须从首帧画的那一刻往后接,起点与首帧矛盾时厂商会自己剪一刀;可加一句「一镜到底、不切镜」)',
    'update_shot(duration:动作量与时长同向调——3 拍塞进 3 秒就是「像快进」;反过来,只加长不加拍只会更慢)',
    'regenerate_shot_video(改完 prompt/时长要重出视频才生效,走报价)',
    'update_shot(speed_factor:只是成片里变速播放,不改厂商生成的内容——做慢镜氛围用,治不了「没演出来」)',
  ] },
  { symptom: '动作发生在裁剪窗口之外', run: 'recommend_trim_window', then: ['trim_shot'] },
  { symptom: '画面多出一个人 / 多出一件道具', run: 'get_storyboards(先看该镜实际用的首帧)', then: ['generate_shot_frame(首帧本身就有→重生首帧再重生视频)', 'split_shot(帧干净、片中长出来→拆成 3~5 秒短镜)'] },
  { symptom: '出图 / 出视频前想知道哪些镜会被厂商拒', run: 'run_precheck', then: ['update_shot', 'generate_shot_frame'] },
  { symptom: '要跑全集 / 想知道整部剧有多少问题、该先修哪几集', run: 'run_drama_precheck', then: ['run_precheck(对 attention 里那几集拿逐条明细)', 'plan_precheck_fix', 'update_shot'] },
  { symptom: '场景图(空景基板)不对 / 重出还是同一类图', run: 'get_scene_prompt', then: ['update_scene(改 image_prompt 正文——只改地点/时段是让平台重拼,拧不过来)', 'regenerate_scene_image(单场重出,覆盖旧图)', 'upload_scene_image(客户自有实拍/外部精修图)', 'generate_shot_frame(下游镜头帧不会自动跟着重出)'] },
  { symptom: '整集健康度 / 缺镜 / 进度', run: 'get_pipeline_status', then: ['get_health_report', 'review_all', 'get_storyboards', 'get_jobs', 'get_run_status', 'get_autofill_status(导入/一键填空的后台补全进度)'] },
  { symptom: '拆完分镜想核对台词有没有丢 / 谁说的 / 哪几镜是关键镜 / 情绪曲线', run: 'get_storyboards(每镜 dialogue_lines/is_key_moment/emotion_intensity,整集一次拿)', then: ['review_storyboards', 'update_shot(补漏句/改台词,改完回 get_storyboards 核对)', 'get_shot_prompts(看某镜画面与首尾帧提示词)'] },
  { symptom: '预算 / 余额', run: 'get_budget_status', then: ['get_cost_estimate'] },
]

export const OPTIONAL_BOOSTS = [
  { what: '世界观概念图', tool: 'generate_world_concept', when: '分镜后默认做(提升整剧一致性),仍走报价确认' },
  { what: '美术圣经 / 视觉锁 / 世界观 Brief 抽取', tool: 'generate_art_bible', when: '建剧后;或 `extract_visual_lock` / `extract_setting_brief` 从剧本反推' },
  { what: '场景组(同场景多镜一次成组出视频)', tool: 'generate_scene_groups', when: '先 `get_scene_group_plan` 看方案' },
  { what: '口型同步', tool: 'lipsync_episode', when: 'TTS 配音项目需要对口型时' },
  { what: '海报 / 封面', tool: 'generate_episode_poster', when: '成片后;`generate_drama_poster` / `generate_cover` 同族' },
  { what: '音效 / 特效 / 转场(本地库匹配)', tool: 'generate_sfx', when: '免费;`generate_effects` / `generate_transitions` 同族' },
  { what: '配乐', tool: 'generate_bgm', when: '按整集情绪弧线生成;终拼自动接管。客户想指定音乐方向就带 prompt(整集一条),写法先读 `get_bgm_prompt_guide`(免费);不带 prompt 就是全自动' },
  { what: '字幕翻译', tool: 'translate_subtitles', when: '出海;双语烧录在项目设定里开' },
]

export const BILLING = {
  prepaid: '预付费、永不透支。余额不足返回 402(带 needed),停下来让客户充值,绝不循环重试。',
  quote_flow:
    '大额步(定妆图 / 分镜 / 出帧 / 出视频 / 场景图)一律 quote_* → 把 estimated_points **原样**告诉客户 → 客户明确同意 → generate_*(带 quote_id)。' +
    '★出图类报价给两个数:estimated_points 是**上界**(拿它准备余额就不会中途 402)、typical_points 是**通常花费**,两个都要说;' +
    '固定价模型下两者相等,出视频的报价与扣费同函数、不存在区间。' +
    'quote_id 一次性、约 15 分钟过期;绝不擅自确认,视频报价可能上万点。' +
    '★出帧类(quote_frames/generate_frames、quote_shot_frame/generate_shot_frame)若要临时换图片模型,' +
    '**两边必须传同一个 image_model**——不一致会被直接拒(400 IMAGE_MODEL_MISMATCH),' +
    '因为模型决定计费档,不同源就是「预估≠扣费」。两边都不传也算一致(用该剧设定的模型)。' +
    '已下架的型号(FLUX 全系列)两端都拒收。',
  pay_as_you_go: '文本步(改写 / 提取 / 自动填充 / 增强提示词)按 token 后付,无需报价但要事先告知。',
  free_families: [
    '所有 get_* / list_* / scan_* / review_* / check_* / recommend_* / get_capabilities_guide / get_autofill_status / get_bgm_prompt_guide',
    'compose_episode / rerender_episode / render_multi_aspect / generate_sfx / generate_effects / generate_transitions',
    'import_storyboard_table / adopt_external_script / get_script_format_spec / check_script_format',
    'get_storyboard_table_spec / check_storyboard_table / get_bulk_import_spec / check_bulk_import / bulk_import_storyboards',
    'update_* / edit_rewritten_script / split_shot / trim_shot / set_character_portrait / upload_*',
  ],
  tools: ['get_budget_status', 'get_cost_estimate'],
}

export interface CommonRequest { customer_says: string; do: string }
export const COMMON_REQUESTS: CommonRequest[] = [
  { customer_says: '你们能做什么 / 我该从哪开始', do: '先问客户手上有什么材料,对照 entry_points 选通道;建剧前 `list_project_options` 把项目类型/画幅/分辨率/引擎给客户挑。' },
  { customer_says: 'AI 把我的剧本改偏了 / 改动太大', do: '① 确认完整原稿已进 `set_script`;② `update_project_settings` 设 rewrite_pipeline=two_pass 后重跑 `rewrite_script`;③ 客户确认外观后 `update_character` profile_locked=1。客户想自己掌控 → 走格式范本三步(`get_script_format_spec` → 外部改 → `check_script_format`)。' },
  { customer_says: '我有分镜表了,直接出片', do: '先 `get_storyboard_table_spec` 把契约给客户/外部工具,`check_storyboard_table` 自检全绿再 `import_storyboard_table`(默认 auto_complete,告知客户按文本计费),不要走改写;`get_autofill_status` 到 done 后 `review_storyboards` 再出图。' },
  { customer_says: '我的工具能导出表格 / 我想让别的 AI 直接生成结构化数据', do: '`get_bulk_import_spec`(契约 + 模板 + 成品示例给对方)→ `check_bulk_import`(errors 清零)→ `bulk_import_storyboards`;replace 模式先取得客户同意。' },
  { customer_says: '换了定妆图 / 换脸后镜头没变', do: '`set_character_portrait` 响应里的 stale_frames 逐镜 `generate_shot_frame`,再重生视频。' },
  { customer_says: '图片一直没出来', do: '`get_storyboards` 看 frame_status:pending=在生成(每张几十秒到数分钟、整集十几分钟),别重复调 `generate_frames`;failed 才是失败,读 fail_reason / fail_hint。' },
  { customer_says: '预算多少 / 怎么更便宜', do: '各步 quote_* + `get_cost_estimate`;降本:hailuo-3(约 1/3)或 wan3.0(约 4 折,仅风格化/空镜/产品镜,写实真人绝不选)+ 草稿期低分辨率。' },
  { customer_says: '成片里话没说完 / 切太快', do: '先 `scan_dialogue_coverage` / `scan_intra_shot_cuts` 定病因,再按 qa_tools 的 then 修;别默认去加长镜头。' },
  { customer_says: '我想自己剪', do: '`export_handoff_pack` + `get_handoff_toolchain`,不走 `compose_episode`。' },
  { customer_says: '要配音 / 不要视频原声', do: '`update_project_settings` use_clip_audio=false → `assign_voices` → `generate_tts` → `compose_episode`。' },
]

export interface PostProductionStage {
  stage: string
  do: string
  /** 这一步最容易翻车的地方 */
  gotcha?: string
}

/**
 * v0.9.1371 — 本地后期引导:客户把镜头下载到**自己电脑**上剪。
 * 与 `compose_episode` 二选一——那条是「平台替你拼、带平台级质量闸」,这条是「素材给你、你自己拼」。
 * 不单开一个 guide 工具:入口越多,agent 越要先猜「该调哪个」。
 */
export const LOCAL_POSTPRODUCTION = {
  when:
    '客户要把镜头下载到自己电脑上剪、配乐、烧字幕、优化转场、做字卡、补旁白时走这条;' +
    '想让平台代拼并要平台级质量闸(终拼预检 / 音画等长 / 响度母带)用 `compose_episode`。两条二选一。',
  where_it_runs:
    '★脚本与 ffmpeg 全部跑在**客户自己的机器**上,平台只发素材 URL 与工具链源码。' +
    'manifest 里是远程 URL,不是服务器上的本地路径;`save_handoff_toolchain` 的 dir 也是客户机器上的绝对路径。' +
    '别把服务器路径当成客户电脑上的路径,也别替客户声称"已经在本地跑完了"——真正执行的是客户那侧。',
  tools: ['export_handoff_pack', 'save_handoff_toolchain', 'get_handoff_toolchain'],
  stages: [
    {
      stage: '1 对需求',
      do: '先问清:哪一集、目标时长、客户有没有自带配乐、字幕样式与排版要求。' +
        '画幅、字幕样式这些项目里已经定过的,用 `get_drama` 读出来直接沿用——客户上一版确认过的偏好别每版重问。',
    },
    {
      stage: '2 查环境',
      do: '确认客户机器上有 ffmpeg(烧字幕要带 libass)、ffprobe、jq、python3,以及够放整集素材的磁盘。',
      gotcha: '缺 libass 时字幕会**静默不烧**——成片看着正常,只是没有字幕。先查再跑,别等出片才发现。',
    },
    {
      stage: '3 取包',
      do: '`export_handoff_pack` 拿 manifest → `save_handoff_toolchain` 把三个脚本落到客户目录 → 跑 fetch_pack.py 下载素材并把内联字幕落成 SRT。',
      gotcha: '素材 URL 到 expires_at 就失效;过期重新调 `export_handoff_pack`,别拿旧 manifest 硬跑。',
    },
    {
      stage: '4 核声音',
      do: '★动剪辑前先核对声音。**逐镜**读 voice_track.location 决定这镜该不该铺对白轨、能不能叠;' +
        '**逐行**读 spoken_lines 逐句核对。location=unknown 的镜必须实际试听裸片。',
      gotcha: '**有字幕不等于有声音**:字幕是逐句的、音频是逐镜的,粒度本来就对不上,' +
        '别按「这镜有字幕」推定每句都有人念。voice_status=caption_no_voice 的行是字卡,本来就没有配音,不是缺失。',
    },
    {
      stage: '5 判接缝',
      do: '逐个接缝看前后画面,结合动作、景别、视线与声音选切点。scene_boundary="start" 是换场(适合给转场),' +
        '"continue" 是同场景(平台默认硬切)。',
      gotcha: '同场景逐镜叠化是"幻灯片拼凑感"的主因;缺失的交接动作**拉长叠化也补不出来**,该重生成就重生成。',
    },
    {
      stage: '6 装配',
      do: '先做代表性样段(字卡、混音各挑一两处)给客户看,再整集出片:compile_timeline.py 展开时间轴 → assemble.sh 装配。',
      gotcha: '裁剪与重叠转场都会移动入点——字幕/对白/音效的绝对时间一律交给 compile_timeline.py 算,**别手算累加**。' +
        '只改声音时保留视频码流(-c:v copy),别整片重编码。',
    },
    {
      stage: '7 验收',
      do: '看**真实成片**:画面、字幕位置、旁白完整性、每个接缝、峰值与音画同步。交付可播放文件 + 版本 + 检查结果。',
      gotcha: '没做的试听或视觉检查要**明说没做**,不许默认通过。',
    },
  ] as PostProductionStage[],
  voice_rules: [
    'location=separate_file:对白在 dialogue_audio,必须自己铺轨,不铺这镜就没台词。',
    'location=baked_in_clip:人声已在裸片音轨里,**再叠一遍是同一句说两遍**(全画外旁白镜最常见)。',
    'location=missing:平台侧确认缺失。正解是回平台 `regenerate_shot_video` 重生成,或 `generate_tts` 补这句,' +
      '音色复用已授权的克隆音(`list_voices` / `set_character_voice`),别在本地硬凑,也别拿转场掩盖。',
    '人声与配乐分开控制:客户说"这句小一点"是调那句的对白轨增益,不是压整条 BGM;' +
      '整体响度达标**不代表**每句都听得清。',
    'clip.probed_has_audio_stream=false 表示平台实测这条裸片连音轨流都没有;反过来不成立——' +
      '有音轨不代表有人声,全旁白镜的环境音本来就是要求厂商出的。',
  ],
  not_verified_until: [
    '「素材下载完成」不是验收。',
    '「脚本退出码 0 / 执行成功」不是验收——ffmpeg 跑完不等于成片对。',
    '「自动转写通过」不等于试听过,别拿它冒充人工听过。',
    '只有看过真实成片(画面 / 字幕位置 / 旁白完整 / 接缝 / 音画同步)才算验收完成;' +
      '平台侧成片用 `get_final_cut` 取。',
  ],
}

export interface ModelCard {
  /** 传给 image_model / video_engine 的取值 */
  id: string
  name: string
  is_default?: boolean
  price: string
  strengths: string[]
  weaknesses: string[]
  best_for: string
  avoid_for?: string
}
export interface ModelCombo { scenario: string; image_model: string; video_engine: string; resolution: string; why: string }

/**
 * v0.9.2018 — 模型选型指南。工具参数描述只列「型号 + 价格」,这里回答「哪个好、好在哪、坑在哪、该怎么配」。
 * ★数字全部来自平台生产实测(带样本量),样本不足的维度如实写「未系统实测」,别替它补结论。
 * ★型号集合与工具参数可选值由 test/mcp-model-guide.test.ts 双向钉住——新增/下架型号两处一起改。
 */
export const MODEL_GUIDE = {
  principle:
    '模型是 drama 级设置(create_drama / update_project_settings 的 image_model、video_engine),整剧统一画风与身份;' +
    '单镜可临时覆盖(图:`generate_shot_frame` 传 image_model,且须与 `quote_shot_frame` 传的同一个;视频编辑:`edit_video_shot` 传 model)。' +
    '选型要主动讲给客户:把价差与优劣摆出来,让客户定,别默默用默认值。' +
    '比较模型「贵不贵」要按**每张可用图/每条可用镜头**算,不是按单张单价——重抽次数差几倍时,单价低的反而更贵。',
  image_models: [
    {
      id: 'gpt-image-2.5-flare', name: 'ChatGPT Image 2.5 Flare', is_default: true,
      price: '基础 11 点 + 每张参考图 18 点(按实际送出的参考图计;常见 4~6 张 ≈ 80~120 点/张);报价是区间,按 estimated_points 备余额',
      strengths: [
        '一次过率最高:同期实测 60.1%(223 个镜位),中位 1 张就出可用图;Nano Banana 2 同口径 4.9%',
        '手部、手持器物、接触关系结构明显更稳(同镜同参考图配对比较,6 对里 4 对明显胜出)',
        '参考图最多 16 张:多人同框时每个角色的身份锚都送得到',
        '竖屏出图 1088×1920,最贴近 9:16',
        '算上重抽,每张可用图的实际花费约为 Nano Banana 2 的 1/3~1/4',
      ],
      weaknesses: [
        '厂商安全拒绝率最高:约 2.61%(Nano Banana 2 约 0.83%),打斗/流血/武器场景更容易触发;平台会自动换 gemini-3.1-flash-image 重出一次',
        '写实电影感剧偶发画风漂成日式动漫 CG(配对样本 6 对里 1 对)',
        '单价随参考图张数浮动,报价只能给区间',
      ],
      best_for: '绝大多数剧的默认选择;近景/特写、手部动作、手持道具、多人同框镜尤其该用它',
      avoid_for: '暴力场面密集且反复被安全拒的镜(那几镜单独换 gemini-3.1-flash-image)',
    },
    {
      id: 'gpt-image-2.5-sunburst', name: 'ChatGPT Image 2.5 Sunburst',
      price: '与 flare 同价(11 + 18/参考图)',
      strengths: ['编辑精度优先,中文字形与细部更准', '其余能力同 flare(16 张参考图、1088×1920)'],
      weaknesses: ['比 flare 慢约 5 秒/张', '平台内样本少,一次过率未单独实测;安全拒绝特性按同厂商同代推定与 flare 相近'],
      best_for: '画面里要出现可读中文(招牌、字卡、屏幕、文件、海报)或细部特写要求高的镜',
      avoid_for: '没有文字需求的整集批量——多等时间、无额外收益',
    },
    {
      id: 'gemini-3.1-flash-image', name: 'Nano Banana 2',
      price: '一口价:镜头帧 71 点/张(1K);定妆照、设定图等身份锚 119 点/张(2K);参考图不另收(最多 14 张)',
      strengths: [
        '画风锚定稳:写实电影感剧不容易漂成动漫风',
        '安全拒绝率低(约 0.83%),GPT 2.5 被拒的镜换它通常能过',
        '固定价,预算好算',
      ],
      weaknesses: [
        '一次过率低:实测 4.9%(123 个镜位),中位要烧 6 张才出一张可用图——单价便宜但总花费反而高',
        '手指、手持器物容易融合或崩坏,且平台的解剖审计对手部覆盖不足,坏手可能被放行,要人工看',
        '≤720p 剧的镜头帧按 1K 档出(768×1376),细节上限低于 GPT 2.5',
      ],
      best_for: '群像/远景/氛围镜、需要稳住写实画风的镜;GPT 2.5 被安全拒的镜的替补',
      avoid_for: '手部特写、手持道具、器物密集(托盘、线缆、算盘、卷轴一类)的近景',
    },
    {
      id: 'gemini-3-pro-image', name: 'Nano Banana Pro',
      price: '175 点/张一口价(2K)',
      strengths: ['画面最精细', '安全拒绝实测 0 次(145 张)', '早期同口径成功率 88.2%,每镜位平均 2.4 张候选'],
      weaknesses: ['最贵,是 flare 常见单价的约 1.5~2 倍', '样本量小(34 个镜位),与 GPT 2.5 的一次过率未做同窗口对比'],
      best_for: '封面、海报、定妆锚这类少量关键图',
      avoid_for: '整集批量出镜头帧',
    },
    {
      id: 'gemini-3.1-flash-lite-image', name: 'Nano Banana 2 Lite',
      price: '31 点/张(经济档,厂商恒 1K)',
      strengths: ['最便宜档之一', '出图快,适合快速看构图'],
      weaknesses: ['分辨率固定 1K,细节上限最低', '平台内未系统实测质量,不建议作交付帧'],
      best_for: '草稿、试风格、分镜预览',
      avoid_for: '交付用的镜头帧与定妆锚——交付前切回 flare',
    },
    {
      id: 'doubao-seedream-5-0-260128', name: 'Seedream 5.0',
      price: '31 点/张(经济档)',
      strengths: ['经济档价格', '出图像素高(厂商最低约 1920×1920 级)', '安全拒绝实测 0 次(170 张)', '参考图最多 10 张'],
      weaknesses: ['平台内样本少,一次过率与手部结构未系统实测', '与 GPT 2.5 / Nano Banana 画风差异明显,整剧中途换它会跳风格'],
      best_for: '预算敏感、想低价试另一种画风的项目(从第一张图就用它,别中途换)',
      avoid_for: '已经用别的模型出过大半集的剧',
    },
  ] as ModelCard[],
  image_decision: [
    '① 默认 gpt-image-2.5-flare,建剧时就定,整集统一。中途换模型会让同一集里出现两种画风和两种画幅。',
    '② 画面里要出现可读中文(招牌/字卡/屏幕/海报)→ 这些镜用 gpt-image-2.5-sunburst。',
    '③ 某镜反复被安全拒(打斗、流血、武器)→ 平台已自动换 Nano Banana 2 重出一次;仍不行就对那一镜 `quote_shot_frame` → `generate_shot_frame` 显式传 image_model=gemini-3.1-flash-image(两次必须同值,否则 400 IMAGE_MODEL_MISMATCH),同时把措辞中性化。',
    '④ 写实电影感剧里某镜画风漂成动漫 → 这一镜换 gemini-3.1-flash-image 重画。',
    '⑤ 手部/持物/多人同框镜出现坏手、手物融合 → 用(或换回) gpt-image-2.5-flare 重画;Nano Banana 系列在这类镜上明显更差。',
    '⑥ 只是试风格、看构图 → gemini-3.1-flash-lite-image 或 Seedream 5.0(31 点),交付前切回主模型重出。',
    '⑦ 封面/海报/定妆锚要最精细 → gemini-3-pro-image(175 点),只用在少量关键图上。',
  ],
  video_engines: [
    {
      id: 'seedance-2.5', name: 'Seedance 2.5', is_default: true,
      price: '720p 约 212 点/秒(在售 480p/720p,高清档停售);单镜 2~30 秒',
      strengths: [
        '指令遵循与人脸细节最强,写实真人剧首选',
        '能力最全:首尾帧链、场景组、关键帧组(组内每镜都送自己的首帧,只有它支持)、就地编辑含时间区间、延长、参考图锚',
        '镜内自行跳切少(实测 1/6 镜),单镜叙事稳',
        '台词念不全的比例最低:23%(294 镜)',
      ],
      weaknesses: [
        '最贵:约为 hailuo-3 的 3 倍、wan3.0 的 2.5 倍',
        '文本审核最严:打斗、流血一类措辞容易直接被拒,要中性化描述',
        '写实角色要做一次虚拟人像核验(每个人物锁 200 点,只有本引擎收)',
      ],
      best_for: '写实真人剧、对白多的剧、要逐镜精确控制画面的剧',
    },
    {
      id: 'hailuo-3', name: 'MiniMax H3',
      price: '720p(=768P)70 点/秒、1080p(=2K)112 点/秒;无独立 480p 档(选了也按 768P 计);单镜 4~15 秒',
      strengths: [
        '约 1/3 成本,还能出 2K',
        '就地编辑保真度高(改色调/改局部时人物服装构图保持得最好),可在 Seedance 剧里单镜借用它做编辑',
        '镜内自行跳切最少(实测 0/5 镜)',
        '原生对白与音效',
      ],
      weaknesses: [
        '慢:单镜约 6 分钟',
        '台词念不全的比例高:50%(26 镜),对白密集剧慎用',
        '不支持关键帧组与时间区间编辑',
        '提示词上限 7000 字符,平台会自动剥掉软性描述块,极长的镜头描述会丢细节',
      ],
      best_for: '写实真人剧但预算紧、对白不密集;单镜编辑(配合 `edit_video_shot` 的 model 参数)',
      avoid_for: '对白密集、赶交付时间的项目',
    },
    {
      id: 'wan3.0', name: 'WAN 3.0',
      price: '480p 42 / 720p 84 / 1080p 168 点/秒;单镜 2~30 秒(2 秒起计费,无 4 秒地板)',
      strengths: [
        '约 4 折成本,2~3 秒短镜更省',
        '快:单镜约 2 分钟,并发好',
        '文本审核宽松,动作/打斗措辞基本能过',
        '有首尾帧双锚或参考图时,风格化角色的风格、服装、道具都跟得住',
      ],
      weaknesses: [
        '输出侧真人脸审核:写实人脸在 720p 及以上一致被拒,重试救不回',
        '会在单个镜头内自行换机位硬切(实测 11/12 镜),叙事镜观感是「画面跳来跳去」,提示词拦不住',
        '只有单张首帧时,强场景描述会把风格化角色拉向写实(漂移)',
        '道具形状锁不住;台词完整度样本不足未测',
      ],
      best_for: '动画/3D 卡通/风格化剧、空镜、产品镜、短平快的剪辑节奏',
      avoid_for: '写实真人剧(绝不选);对白多、要单镜稳定叙事的剧',
    },
    {
      id: 'wan3.0-prime', name: 'WAN 3.0 Prime(高速版)',
      price: '480p 63 / 720p 126 / 1080p 252 点/秒(wan3.0 的 1.5 倍)',
      strengths: ['能力同 wan3.0,出片快约一倍(单镜约 1 分钟)'],
      weaknesses: ['同 wan3.0:写实人脸 720p+ 被拒、镜内自剪', '价格是 wan3.0 的 1.5 倍'],
      best_for: '风格化项目赶交付',
      avoid_for: '同 wan3.0;不赶时间就用 wan3.0',
    },
  ] as ModelCard[],
  video_decision: [
    '① 先定「是不是写实真人」:是 → seedance-2.5(默认)或降本 hailuo-3;绝不选 wan3.0 / wan3.0-prime。',
    '② 写实真人 + 对白密集 → seedance-2.5(台词念不全 23% vs hailuo-3 50%)。',
    '③ 风格化/动画/3D/空镜/产品镜 → wan3.0,赶交付用 wan3.0-prime;但讲连贯故事、要单镜稳定的叙事剧仍优先 seedance-2.5(WAN 镜内自剪 11/12)。',
    '④ 想让每一镜的首帧都进组视频(关键帧组)→ 只有 seedance-2.5 支持;其他引擎的场景组只送组首镜首帧。',
    '⑤ 出视频前就把引擎定好:切换不会重做已生成的镜头,同一剧混用引擎会有风格/身份跳变。',
    '⑥ 分辨率:草稿迭代用低档(WAN 剧 480p,其余 720p);交付 seedance-2.5 维持 720p、hailuo-3 用 1080p(=2K)、WAN 用 1080p。',
    '⑦ 单镜保持 3~5 秒:镜头越长模型自由发挥越多,所有引擎通用,WAN 上最明显。生成后可用 `scan_intra_shot_cuts` 查镜内跳切。',
    '⑧ 只想改一镜的色调/局部 → `edit_video_shot` 可以单独选 model=hailuo-3(保真、便宜),不用改剧引擎;但它不支持 start_sec/end_sec 区间。',
  ],
  combos: [
    { scenario: '写实真人短剧(标准配置)', image_model: 'gpt-image-2.5-flare', video_engine: 'seedance-2.5', resolution: '720p', why: '出图一次过率最高 + 视频人脸与指令遵循最强,返工最少' },
    { scenario: '写实真人短剧 · 预算紧、对白不多', image_model: 'gpt-image-2.5-flare', video_engine: 'hailuo-3', resolution: '草稿 720p / 交付 1080p', why: '视频成本约 1/3;对白多就回到 seedance-2.5' },
    { scenario: '动画 / 3D 卡通 / 风格化剧', image_model: 'gpt-image-2.5-flare', video_engine: 'wan3.0', resolution: '草稿 480p / 交付 1080p', why: '视频约 4 折且快;记得出尾帧给双锚,风格才锁得住' },
    { scenario: '广告 / 产品片 / 空镜为主', image_model: 'gpt-image-2.5-flare', video_engine: 'wan3.0', resolution: '480p 试片 / 1080p 交付', why: '无真人脸审核问题,短镜 2 秒起计费最省;赶工换 wan3.0-prime' },
    { scenario: '画面文字多(招牌、屏幕、文件、字卡)', image_model: 'gpt-image-2.5-sunburst', video_engine: 'seedance-2.5', resolution: '720p', why: '中文字形更准;视频按剧的真人/风格化再按上面选' },
    { scenario: '打斗、流血场面多的写实剧', image_model: 'gpt-image-2.5-flare', video_engine: 'seedance-2.5', resolution: '720p', why: '图被安全拒的镜平台自动换 Nano Banana 2;视频侧把血腥措辞改成中性描述(Seedance 文本审核严)。不要为了过审换 WAN——写实人脸会被拒' },
  ] as ModelCombo[],
}

export const HOW_TO_READ =
  '先按 entry_points 判客户手上的材料该走哪条通道(这是最常被跳过的一步),再按 pipeline 顺序推进、每道 review_gates 必过;' +
  '收费步按 billing.quote_flow 报价确认;遇到质量投诉按 qa_tools 的 symptom 选检测工具先定病因。'

export function buildGuide() {
  return {
    version: GUIDE_VERSION,
    how_to_read: HOW_TO_READ,
    entry_points: ENTRY_POINTS,
    pipeline: PIPELINE,
    review_gates: { rule: REVIEW_GATE_RULE, gates: REVIEW_GATES },
    qa_tools: QA_TOOLS,
    optional_boosts: OPTIONAL_BOOSTS,
    billing: BILLING,
    common_requests: COMMON_REQUESTS,
    local_postproduction: LOCAL_POSTPRODUCTION,
    model_guide: MODEL_GUIDE,
  }
}
export type GuideSection = Exclude<keyof ReturnType<typeof buildGuide>, 'version' | 'how_to_read'>
export const GUIDE_SECTIONS = ['entry_points', 'pipeline', 'review_gates', 'qa_tools', 'optional_boosts', 'billing', 'common_requests', 'local_postproduction', 'model_guide'] as const

const head = (s: string) => /^[a-z][a-z0-9_]*/.exec(s.trim())?.[0] ?? null
const inProse = (s: string | undefined) => [...(s ?? '').matchAll(/`([a-z][a-z0-9_]*)`/g)].map((m) => m[1])

/** 引导里引用到的全部工具名(去重)——哨兵测试用:每一个都必须真的注册了。 */
export function referencedTools(): string[] {
  const out = new Set<string>()
  const add = (v: string | null) => { if (v) out.add(v) }
  for (const e of ENTRY_POINTS) { e.use.forEach((u) => add(head(u))); [...inProse(e.avoid), ...inProse(e.note)].forEach(add) }
  for (const p of PIPELINE) { p.tools.forEach((t) => add(head(t))); if (p.gate) add(head(p.gate)); inProse(p.note).forEach(add) }
  for (const g of REVIEW_GATES) { add(g.run); g.before.forEach(add) }
  inProse(REVIEW_GATE_RULE).forEach(add)
  for (const q of QA_TOOLS) { add(head(q.run)); q.then.forEach((t) => add(head(t))) }
  for (const b of OPTIONAL_BOOSTS) { add(b.tool); inProse(b.when).forEach(add) }
  BILLING.tools.forEach(add)
  for (const c of COMMON_REQUESTS) inProse(c.do).forEach(add)
  // v0.9.1371 — 本地后期段同样纳入哨兵:漏了这几行,这段引导就能悄悄指向不存在的工具。
  LOCAL_POSTPRODUCTION.tools.forEach(add)
  ;[LOCAL_POSTPRODUCTION.when, LOCAL_POSTPRODUCTION.where_it_runs].forEach((s) => inProse(s).forEach(add))
  for (const s of LOCAL_POSTPRODUCTION.stages) { inProse(s.do).forEach(add); inProse(s.gotcha).forEach(add) }
  for (const r of [...LOCAL_POSTPRODUCTION.voice_rules, ...LOCAL_POSTPRODUCTION.not_verified_until]) inProse(r).forEach(add)
  // 模型选型段:正文里反引号包住的工具名同样纳入哨兵
  ;[MODEL_GUIDE.principle, ...MODEL_GUIDE.image_decision, ...MODEL_GUIDE.video_decision].forEach((s) => inProse(s).forEach(add))
  for (const m of [...MODEL_GUIDE.image_models, ...MODEL_GUIDE.video_engines]) {
    [...m.strengths, ...m.weaknesses, m.best_for, m.avoid_for].forEach((s) => inProse(s).forEach(add))
  }
  return [...out].sort()
}

/**
 * server 级 instructions:客户端 initialize 时拿到,多数客户端注入系统提示。
 * 要短——只放入口决策树、产线顺序、硬闸与计费纪律;细节让 agent 调 get_capabilities_guide。
 */
export function buildInstructions(): string {
  const entry = ENTRY_POINTS.map((e) => `· ${e.customer_has} → ${e.flow ?? e.use.map((u) => head(u)).filter(Boolean).join(' → ')}`).join('\n')
  return [
    'StarReel = 预付费 AI 短剧产线(剧本 → AI 改写 → 资产 → 分镜 → 镜头图 → 视频 → 音频 → 成片 .mp4),120+ 个工具,全部走本服务器。',
    '',
    '★第一步永远是判「客户手上有什么材料」——它决定入口,选错入口的返工都是真扣费(全表与要点:get_capabilities_guide):',
    entry,
    '',
    '产线顺序(不跳步):create_drama(建剧即设好 setting_brief/画幅/video_engine/image_model/一致性锚,全免费) → set_script → rewrite_script → ★review_script → extract_assets → quote/generate_storyboards → ★review_storyboards → 定妆图+设定图 / 世界观图 / 动作模板 / 色彩脚本 → run_precheck → quote/generate_frames(默认只出首帧) → tail_frame_plan(免费·哪几镜要独立尾帧) → quote/generate_frames(frame_type=last_frame) → ★review_frames → quote/generate_videos → 音频 → compose_episode → get_final_cut。用 get_pipeline_status 查进度。',
    '三道免费硬闸(跳过 → 400):review_script(extract_assets/分镜前)· review_storyboards(出图前)· review_frames(出视频前);review_token 随下游收费工具传,findings 逐条原样告诉客户。',
    '计费纪律:预付费不透支;大额步 quote_* → 把 estimated_points 原样告诉客户 → 客户同意后 generate_*(quote_id),绝不擅自确认;' +
    '出图类报价给 estimated_points(上界,按它准备余额)与 typical_points(通常花费),两个都说;' +
    '文本步按 token 后付;402 就停下让客户充值,别重试。',
    '长任务异步:generate_* 立即返回,用 get_pipeline_status / get_storyboards / get_run_status 轮询;图片 pending = 还在生成,别重复调(重复扣费)。',
    '改写成功后只 edit_rewritten_script 点改,别重跑 rewrite_script;角色外观唯一真相源是人物档案(update_character),别写进 visual_lock/art_bible。',
    '选图片模型/视频引擎、客户问「哪个模型好 / 怎么更省」→ get_capabilities_guide(section=model_guide):各模型实测优劣、价格、决策步骤与推荐组合;建剧时就主动讲给客户定。',
    '不确定该用哪个工具、客户问「你们能做什么」→ 先调 get_capabilities_guide(免费、本地、不联网)。',
  ].join('\n')
}
