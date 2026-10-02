/** 只读交接：保留源素材，不调用生成、上传或平台回填。 */
export function localColorHandoff(manifest: any, goal = '', missingShots: number[] = []) {
  return {
    ...manifest,
    render_target: { ...manifest.render_target, color_lut: null },
    postproduction: {
      version: 1,
      workflow: 'local_color',
      status: 'not_processed',
      goal,
      platform_lut: manifest.render_target?.source_color_lut ?? manifest.render_target?.color_lut ?? null,
      missing_shots: missingShots,
      steps: [
        '将本清单保存为 manifest.json，用 save_handoff_toolchain 保存工具链，再运行 python3 fetch_pack.py manifest.json -o ./pack；使用新的输出目录。',
        '下载后保留 originals；核对色彩配置与来源，未标记的配置不能凭空认定。外部上传素材可能已经调色，本次导出不会撤销既有处理。',
        '从客户确认的参考图确定目标与保护项；色彩脚本只作后期说明，不提高生成提示词优先级。参考图文件由客户在本地选择。',
        '先对代表性素材试调，保存轻、中、强版本到独立目录。优先可撤销的调色；生成式重绘可能改变身份、衣料与构图。',
        '按客户选择使用本地软件或第三方 AI；上传第三方、收费调用均须先说明数据去向和费用并取得授权。没有连接或本地执行能力时只交付操作说明，不声称已经处理。',
        '打开 comparison.html 选择本地参考图和处理后文件逐镜对比；选择文件只在浏览器本地预览。核对肤色、高光、暗部、蒙版边缘；视频再查闪烁、时长、帧率、音轨和同步。',
        '人工确认后交付新版本与检查结果；本工具不自动上传或覆盖平台资产。需要回传时另行确认支持的入口。',
      ],
      assembly_policy: '本包关闭平台 LUT 自动应用，避免外部调色叠加。平台项目设定不变；平台 LUT 仅作为记录保留。未处理源片不得冒充已调色交付。',
      limitations: '下载成功不是调色完成；比较页不自动判定质量；仅有图片时不能装配视频；视频需继续遵守逐镜 voice_track、裁剪和字幕时间基准。',
    },
  }
}

export function imageHandoff(episodeId: number, rows: any, goal = '') {
  if (!Array.isArray(rows)) throw new Error('分镜返回格式异常，无法导出图片清单')
  const missing: number[] = []
  const shots = rows.flatMap((row: any) => {
    const images: Array<Record<string, unknown>> = []
    for (const frame of ['first', 'last'] as const) {
      const url = row[`${frame}_frame_image`]
      if (!url || images.some(image => image.url === url)) continue
      images.push({ frame_type: `${frame}_frame`, url, source: row[`${frame}_frame_source`] ?? 'unknown', prior_grade: 'unknown' })
    }
    if (!images.length) { missing.push(row.storyboard_number); return [] }
    return [{ storyboard_id: row.id, shot_number: row.storyboard_number, scene_id: row.scene_id ?? null, images }]
  })
  if (!shots.length) throw new Error('本集没有可导出的现有镜头图片；未发起生成或扣费')
  return localColorHandoff({ manifest_version: '0.1', media_type: 'images', episode_id: episodeId, shots, render_target: { color_lut: null } }, goal, missing)
}
