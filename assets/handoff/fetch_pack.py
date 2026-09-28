#!/usr/bin/env python3
"""
fetch_pack.py — 把 export_handoff_pack 返回的 manifest 拉成一个本地素材包目录。

平台返回的 manifest 是「URL + 内联字幕」，而 compile_timeline.py / assemble.sh 要的是
「本地文件」。本脚本负责这一步适配：下载全部素材、把内联 cues 落成逐镜 SRT、
把 manifest 里的 url 字段改写成包内相对路径。

用法:
    # manifest 存成文件后
    python3 fetch_pack.py manifest.json -o ./pack
    # 或直接从 stdin
    cat manifest.json | python3 fetch_pack.py - -o ./pack

产物:
    pack/manifest.json          # 已改写成本地相对路径，可直接喂给 compile_timeline.py
    pack/clips/shot_001.mp4 …
    pack/audio/dialogue/…  pack/audio/sfx/…  pack/audio/bgm/…
    pack/subs/shot_001.srt …
    pack/lut/haldclut.png       # 有调色时才有

之后:
    python3 compile_timeline.py ./pack [--transitions plan.json]
    ./assemble.sh ./pack out.mp4 [plan.json]

只用标准库，无第三方依赖。
"""
import argparse
import hashlib
import html
from urllib.parse import urlparse
import json
import os
import sys
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

DOWNLOAD_TIMEOUT_SEC = 120
RETRIES = 3


def fetch(url: str, dest: str) -> str:
    """下载到 dest。已存在且非空则跳过（断点续跑友好）。返回 dest。"""
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"
    last = None
    for attempt in range(1, RETRIES + 1):
        try:
            with urllib.request.urlopen(url, timeout=DOWNLOAD_TIMEOUT_SEC) as r, open(tmp, "wb") as f:
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk:
                        break
                    f.write(chunk)
            os.replace(tmp, dest)      # 原子落位，中断不会留下半个文件冒充成品
            return dest
        except (urllib.error.URLError, urllib.error.HTTPError, OSError) as e:
            last = e
            if os.path.exists(tmp):
                os.unlink(tmp)
    raise RuntimeError(f"下载失败({RETRIES} 次): {url}\n  {last}")


def fmt_ms(ms: int) -> str:
    ms = max(0, int(ms))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def write_srt(path: str, cues) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    n = 0
    with open(path, "w", encoding="utf-8") as f:
        for c in cues:
            text = str(c.get("text", "")).strip()
            if not text:
                continue
            n += 1
            f.write(f"{n}\n{fmt_ms(c['start_ms'])} --> {fmt_ms(c['end_ms'])}\n{text}\n\n")
    return n



def write_postproduction(out, manifest, jobs):
    """仅写本地交接说明与人工对比页，不执行调色、不上传素材。"""
    post = manifest["postproduction"]
    post["status"] = "downloaded_not_processed"
    lines = ["# 本地后期交接", "", "状态：素材已下载，尚未调色或验收。", "",
             "## 客户目标（仅作素材说明）", "", post.get("goal") or "待客户确认", "",
             "## 操作步骤", ""]
    lines.extend(f"{i+1}. {step}" for i, step in enumerate(post.get("steps", [])))
    lines.extend(["", post.get("assembly_policy", ""), "", post.get("limitations", ""), "",
                  "源文件保持不变，处理结果另存。参考图只表达意图，批准样张才是本项目调色基准。",
                  "对比后记录采用文件、配方/软件版本及未完成检查；此页面不会自动批准或回传。"])
    if post.get("missing_shots"):
        lines.append("缺少图片的镜号：" + ", ".join(map(str, post["missing_shots"])))
    with open(os.path.join(out, "POSTPRODUCTION.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    hashes = {}
    for _, rel in jobs:
        digest = hashlib.sha256()
        with open(os.path.join(out, rel), "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                digest.update(chunk)
        hashes[rel] = digest.hexdigest()
    with open(os.path.join(out, "checksums.json"), "w", encoding="utf-8") as f:
        json.dump(hashes, f, ensure_ascii=False, indent=2)
    page = ['''<!doctype html><meta charset="utf-8"><title>本地后期对比</title>
<style>body{background:#16191d;color:#eee;font:16px sans-serif;margin:24px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:30px}img,video{max-width:100%;max-height:65vh}input{margin:12px}pre{white-space:pre-wrap}a{color:#ade}</style>
<h1>本地后期对比</h1><p>源素材与处理后版本人工对比；选择文件仅在浏览器本地预览，不会上传。未选择结果不代表已完成。</p>
<p>参考图：<input type="file" accept="image/*" data-target="reference"></p><img id="reference">
<pre>''', html.escape(post.get("goal") or "目标待确认"), "</pre>"]
    count = 0
    for shot in manifest.get("shots", []):
        media = list(shot.get("images") or [])
        if (shot.get("clip") or {}).get("file"):
            media.append(shot["clip"])
        for item in media:
            rel = item.get("file")
            if not rel:
                continue
            count += 1
            tag = "video" if item is shot.get("clip") else "img"
            controls = " controls" if tag == "video" else ""
            accept = "video/*" if tag == "video" else "image/*"
            label = html.escape(f"镜头 {shot['shot_number']} {item.get('frame_type', 'video')}")
            page.append(f'<h2>{label}</h2><div class="pair"><div><p>源素材</p><{tag}{controls} src="{html.escape(rel, quote=True)}"></{tag}></div>'
                        f'<div><p>处理后（待选择）</p><input type="file" accept="{accept}" data-target="result-{count}"><{tag}{controls} id="result-{count}"></{tag}></div></div>')
    page.append('''<script>document.querySelectorAll('input[data-target]').forEach(input=>input.addEventListener('change',()=>{const f=input.files[0];if(!f)return;const el=document.getElementById(input.dataset.target);if(el.dataset.url)URL.revokeObjectURL(el.dataset.url);el.dataset.url=URL.createObjectURL(f);el.src=el.dataset.url}));</script>''')
    with open(os.path.join(out, "comparison.html"), "w", encoding="utf-8") as f:
        f.write("".join(page))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest", help="manifest.json 路径，或 - 表示从 stdin 读")
    ap.add_argument("-o", "--outdir", default="./pack")
    ap.add_argument("-j", "--jobs", type=int, default=4, help="并发下载数（默认 4）")
    a = ap.parse_args()

    raw = sys.stdin.read() if a.manifest == "-" else open(a.manifest, encoding="utf-8").read()
    m = json.loads(raw)
    # MCP 工具可能把 manifest 包在 data 里返回，两种都认
    m = m.get("data", m) if isinstance(m.get("data"), dict) else m

    if m.get("manifest_version") != "0.1":
        sys.exit(f"不认识的 manifest_version: {m.get('manifest_version')!r}，拒绝猜测")

    out = a.outdir
    local_color = (m.get("postproduction") or {}).get("workflow") == "local_color"
    if local_color and os.path.exists(out) and os.listdir(out):
        sys.exit("本地后期请使用新的空目录，避免覆盖源素材或误用旧版本缓存")
    os.makedirs(out, exist_ok=True)
    if local_color:
        with open(os.path.join(out, "source-manifest.json"), "w", encoding="utf-8") as f:
            json.dump(m, f, ensure_ascii=False, indent=2)
        # 再次兜底：本地后期不自动烘焙项目 LUT。
        m.setdefault("render_target", {})["color_lut"] = None
    jobs = []            # (url, 包内相对路径)

    for i, sh in enumerate(m.get("shots", [])):
        n = int(sh["shot_number"])
        tag = f"{n:03d}"
        for k, image in enumerate(sh.get("images") or []):
            if not image.get("url"):
                continue
            ext = os.path.splitext(urlparse(image["url"]).path)[1].lower()
            if ext not in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"):
                ext = ".img"
            rel = f"originals/shot_{tag}_{k}{ext}"
            jobs.append((image.pop("url"), rel))
            image["file"] = rel
        clip = sh.get("clip") or {}
        if clip.get("url"):
            rel = f"clips/shot_{tag}.mp4"
            jobs.append((clip.pop("url"), rel))
            clip["file"] = rel

        dlg = sh.get("dialogue_audio")
        if dlg and dlg.get("url"):
            rel = f"audio/dialogue/shot_{tag}.wav"
            jobs.append((dlg.pop("url"), rel))
            dlg["file"] = rel

        for k, fx in enumerate(sh.get("sfx") or []):
            if not fx.get("url"):
                continue
            rel = f"audio/sfx/shot_{tag}_{k}.wav"
            jobs.append((fx.pop("url"), rel))
            fx["file"] = rel

        # 内联 cues → 逐镜 SRT（时间码基准仍是「该镜 trim 后的第 0 毫秒」，不做任何平移）
        cues = ((sh.get("subtitle") or {}).get("cues")) or []
        if cues:
            rel = f"subs/shot_{tag}.srt"
            cnt = write_srt(os.path.join(out, rel), cues)
            sh["subtitle"] = {"file": rel, "cue_count": cnt}
        else:
            sh["subtitle"] = {"file": None, "cue_count": 0}

    for k, b in enumerate(m.get("bgm") or []):
        if not b.get("url"):
            continue
        rel = f"audio/bgm/track_{k}.wav"
        jobs.append((b.pop("url"), rel))
        b["file"] = rel

    lut = (m.get("render_target") or {}).get("color_lut")
    if isinstance(lut, dict) and lut.get("haldclut_url"):
        rel = "lut/haldclut.png"
        jobs.append((lut.pop("haldclut_url"), rel))
        lut["file"] = rel

    if not jobs:
        sys.exit("manifest 里没有任何可下载资源（URL 可能已过期，重新调 export_handoff_pack）")

    print(f"下载 {len(jobs)} 个文件 → {out}")
    errors = []

    def one(job):
        url, rel = job
        try:
            fetch(url, os.path.join(out, rel))
        except Exception as e:            # 单个失败不中断整批，最后一起报
            errors.append(f"{rel}: {e}")

    with ThreadPoolExecutor(max_workers=max(1, a.jobs)) as ex:
        list(ex.map(one, jobs))

    if local_color and not errors:
        write_postproduction(out, m, jobs)

    with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=2)

    if errors:
        print(f"\n{len(errors)} 个文件下载失败：", file=sys.stderr)
        for e in errors[:20]:
            print("  " + e, file=sys.stderr)
        print("URL 有有效期，过期就重新调 export_handoff_pack 拿新的 manifest。", file=sys.stderr)
        sys.exit(1)

    if local_color:
        print("素材下载完成，尚未调色。下一步：阅读 POSTPRODUCTION.md，在本地工具处理后打开 comparison.html 对比。")
        return

    print(f"完成。下一步：\n  python3 compile_timeline.py {out}\n  ./assemble.sh {out} out.mp4")


if __name__ == "__main__":
    main()
