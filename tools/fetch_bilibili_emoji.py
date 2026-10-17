#!/usr/bin/env python3
"""拉取 B 站「小黄脸」表情包并落盘（离线内置）。

- 接口：https://api.bilibili.com/x/emote/package?business=reply&ids=1
- 产物：assets/emoji/builtin/eNNN.png + manifest.json
- 过滤：名称含「愚人节」的变体一律排除

表情版权归 bilibili 及原作者所有，仅用于个人学习与自建站点内置表情；
如需商用请自行取得授权，或删除 assets/emoji/builtin 后改用自有素材。
"""
import json
import os
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "emoji", "builtin")
API = "https://api.bilibili.com/x/emote/package?business=reply&ids=1"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
SKIP_PATTERNS = ("愚人节", "_愚人", "愚人")


def fetch(url, referer="https://www.bilibili.com/", timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": referer})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def fetch_retry(url, attempts=4):
    import time
    last = None
    for i in range(attempts):
        try:
            return fetch(url)
        except Exception as e:  # 网络抖动重试
            last = e
            time.sleep(1.2 * (i + 1))
    raise last


def clean_name(text):
    name = text.strip()
    if name.startswith("[") and name.endswith("]"):
        name = name[1:-1]
    return name.strip()


def main():
    data = json.loads(fetch(API).decode("utf-8"))
    if data.get("code") != 0:
        print("接口返回错误：%s" % data.get("message"), file=sys.stderr)
        return 1
    packages = data["data"]["packages"]
    if not packages:
        print("没有取到表情包", file=sys.stderr)
        return 1
    pkg = packages[0]
    emotes = pkg.get("emote") or []
    os.makedirs(OUT, exist_ok=True)

    # 清掉旧的矢量素材与清单；png/gif 保留以支持断点续跑
    for f in os.listdir(OUT):
        if f.lower().endswith((".svg", ".json")):
            os.remove(os.path.join(OUT, f))

    items = []
    skipped = 0
    for e in emotes:
        name = clean_name(e.get("text", ""))
        if not name or any(p in name for p in SKIP_PATTERNS):
            skipped += 1
            continue
        items.append({"name": name, "url": e.get("url", ""), "gif": e.get("url", "").lower().endswith(".gif")})

    def download(job):
        idx, it = job
        ext = ".gif" if it["gif"] else ".png"
        fn = "e%03d%s" % (idx + 1, ext)
        path = os.path.join(OUT, fn)
        if os.path.isfile(path) and os.path.getsize(path) > 512:
            return {"name": it["name"], "file": fn, "is_gif": 1 if it["gif"] else 0,
                    "bytes": os.path.getsize(path)}
        try:
            raw = fetch_retry(it["url"])
        except Exception as e:
            print("跳过 %s：%s" % (it["name"], e), file=sys.stderr)
            return None
        with open(path, "wb") as f:
            f.write(raw)
        return {"name": it["name"], "file": fn, "is_gif": 1 if it["gif"] else 0, "bytes": len(raw)}

    with ThreadPoolExecutor(max_workers=6) as ex:
        results = [r for r in ex.map(download, list(enumerate(items))) if r]

    results.sort(key=lambda x: x["name"])
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"package": "小黄脸", "source": "bilibili", "items": results}, f,
                  ensure_ascii=False, indent=1)

    total = sum(r["bytes"] for r in results)
    print("package=%s 下载=%d 跳过=%d 合计=%.2f MB" % (pkg.get("text"), len(results), skipped, total / 1048576.0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
