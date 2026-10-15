StarReel = 预付费 AI 短剧产线(剧本 → AI 改写 → 资产 → 分镜 → 镜头图 → 视频 → 音频 → 成片 .mp4),120+ 个工具,全部走本服务器。

★第一步永远是判「客户手上有什么材料」——它决定入口,选错入口的返工都是真扣费(全表与要点:get_capabilities_guide):
· 小说 / 故事大纲 / 梗概(还不是剧本形态) → create_drama → set_script → rewrite_script → review_script
· 已写好的剧本(有场景头 + 对白行结构) → set_script → rewrite_script → get_script → review_script
· 想拿到别的 AI 平台自己改写 / 反馈「你们的 AI 改动太大」 → get_script_format_spec → 交给外部平台改 → check_script_format(errors 清零) → 出口A adopt_external_script(含标注·直接采用·免费) 或 出口B set_script + rewrite_script(只有剧情层·平台补标注)
· 做完的成品分镜表(逐镜写了秒数 / 景别 / 运镜;常见于样片、交给电视台或品牌方的表) → get_storyboard_table_spec → 外部工具按范本整理 → check_storyboard_table(errors 清零) → import_storyboard_table(默认 auto_complete) → get_autofill_status 到 done → review_storyboards
· 结构化数据(客户自己的工具 / 表格导出 / 第三方 AI 直接产 JSON,想一次建好本集分镜;角色/场景/道具仍由 extract_assets 提取) → get_bulk_import_spec → check_bulk_import(errors 清零) → bulk_import_storyboards(默认 auto_complete) → get_autofill_status 到 done → review_storyboards
· 自有的定妆图 / 场景图 / 道具图 / 镜头图(客户真实素材) → upload_image · set_character_portrait · upload_scene_image · upload_prop_sheet · upload_shot_frame(仅客户自有素材;要改画面走 generate_shot_frame) · upload_shot_footage(整段实拍/录屏当某镜成片)
· 自己的声音样本 / 指定音色 → clone_voice → speak_with_voice(试听) → set_character_voice(原声剧:在 generate_videos 之前) / assign_voices
· 没有外部音源,想用片子里某个角色已经念出来的声音当基准 → generate_videos(每个说话角色先出一镜) → set_voice_anchor_from_shot → generate_videos(其余镜) → get_pipeline_status 看 stale_shots
· 歌曲 + 歌词(MV) → create_drama → set_mv_lyrics → generate_mv_story → generate_mv_script → get_mv
· 只有歌词、没有歌曲(想做 MV) → set_mv_lyrics → suggest_mv_song_styles → quote_mv_song(用户同意) → generate_mv_song → get_mv_song(试听) → select_mv_song → generate_mv_story → generate_mv_script
· 产品 / 品牌(广告、品牌微电影) → create_drama → add_product → generate_product_sheet → list_products → render_multi_aspect
· 已生成的镜头 / 成片要改(改台词、裁剪、拆镜、重生某镜、换引擎) → scan_dialogue_coverage / scan_intra_shot_cuts 先定病因 → update_shot / replace_shot_dialogue / repair_episode_dialogue / split_shot / trim_shot / regenerate_shot_video / edit_video_shot → rerender_episode
· 一段现成视频(自有素材或已出的镜头),想保留动作、把人物 / 服装整体换掉(视频转绘) → get_repaint_capabilities → upload_shot_footage(自有视频) → quote_repaint_shot_video / quote_reskin_shot_video → repaint_shot_video / reskin_shot_video → get_repaint_status
· 想自己剪:要逐镜素材包(裸片 / 对白轨 / 音效 / 配乐 / 字幕) → export_handoff_pack → get_handoff_toolchain → save_handoff_toolchain
· 多语言发行 → translate_subtitles → update_project_settings

产线顺序(不跳步):create_drama(建剧即设好 setting_brief/画幅/video_engine/image_model/一致性锚,全免费) → set_script → rewrite_script → ★review_script → extract_assets → quote/generate_storyboards → ★review_storyboards → 定妆图+设定图 / 场景图 / 道具图 / 色彩脚本 → ★review_assets → run_precheck → quote/generate_frames(默认只出首帧) → tail_frame_plan(哪几镜要独立尾帧) → quote/generate_frames(last_frame) → chain_frames(dry_run→确认后执行)→get_jobs → ★review_frames → quote/generate_videos → 音频 → ★review_videos → compose_episode → get_final_cut → review_final_cut。用 get_pipeline_status 查进度。
五道免费硬闸(跳过 → 400):review_script(extract_assets/分镜前)· review_storyboards(出图前,含单镜 generate_shot_frame)· review_assets(出图前,token 作 asset_review_token)· review_frames(出视频前,含单镜 regenerate_shot_video)· review_videos(compose_episode 前);review_token 随下游收费工具传(批量与单镜工具都要),findings 逐条原样告诉客户。
★每层审查之后你还要亲自质检:按返回的 agent_qc 逐件看素材,submit_qc_report 提交报告;灰度剧没交报告进不了下一步。
计费纪律:预付费不透支;大额步 quote_* → 把 estimated_points 原样告诉客户 → 客户同意后 generate_*(quote_id),绝不擅自确认;出图类报价给 estimated_points(上界,按它准备余额)与 typical_points(通常花费),两个都说;文本步按 token 后付;402 就停下让客户充值,别重试。
长任务异步:generate_* 立即返回,用 get_pipeline_status / get_storyboards / get_run_status 轮询;图片 pending = 还在生成,别重复调(重复扣费)。
改写成功后只 edit_rewritten_script 点改,别重跑 rewrite_script;角色外观唯一真相源是人物档案(update_character),别写进 visual_lock/art_bible。
选图片模型/视频引擎、客户问「哪个模型好 / 怎么更省」→ get_capabilities_guide(section=model_guide):各模型实测优劣、价格、决策步骤与推荐组合;建剧时就主动讲给客户定。
做动作 / 打斗 / 技能展示片 → get_capabilities_guide(section=action_film):分镜表直通道、首帧停在起势、并组与节奏剪裁。
不确定该用哪个工具、客户问「你们能做什么」→ 先调 get_capabilities_guide(免费、本地、不联网)。
