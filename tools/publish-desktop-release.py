#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
发布 Windows 桌面版安装包（幂等，默认 dry-run）

  1) 放包到 /var/www/download/（旧包保留=回滚）
  2) 计数服务 SEEDS/LABELS 登记，新包继承旧包累计下载数
  3) 两处页面里的版本号、文件名、计数属性、下载链接一次改齐
  4) 自检：旧版本残留 / 页面 200 / Content-Length+MIME / 计数可读

用法：
  python3 publish-desktop-release.py --exe /tmp/xx.exe --version 0.1.18           # 预演
  python3 publish-desktop-release.py --exe /tmp/xx.exe --version 0.1.18 --apply   # 执行
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

DOWNLOAD_DIR = "/var/www/download"
HTML_DIRS = ["/var/www/html", "/home/ubuntu/giyi.host"]
COUNTER_PY = "/opt/geyi-downloads/counter.py"
SITE = "https://geyi.host"
PAGES = ["qianfan-yida.html", "products.html"]


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def write(p, s):
    with open(p, "w", encoding="utf-8") as f:
        f.write(s)


def human_mb(n):
    return "%.1f MB" % (n / 1024 / 1024)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--exe", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    ver = a.version.lstrip("v")
    new_name = "qianfan-yida-desktop-v%s-windows-x64.exe" % ver
    size = os.path.getsize(a.exe)
    sha = hashlib.sha256(open(a.exe, "rb").read()).hexdigest()

    cur = read(os.path.join(HTML_DIRS[0], "qianfan-yida.html"))
    m = re.search(r"qianfan-yida-desktop-v([0-9.]+)-windows-x64\.exe", cur)
    old_ver = m.group(1) if m else None
    if not old_ver:
        print("无法从页面识别旧版本号（qianfan-yida-desktop-vX.Y.Z-windows-x64.exe），终止")
        sys.exit(1)
    old_name = "qianfan-yida-desktop-v%s-windows-x64.exe" % old_ver

    old_total = None
    try:
        with urllib.request.urlopen("%s/download/count?name=%s" % (SITE, old_name), timeout=10) as r:
            old_total = json.load(r).get("total")
    except Exception as e:
        print("取旧包计数失败:", e)

    print("== 源包 ==\n  %s\n  %d 字节 (%s)  SHA-256 %s" % (a.exe, size, human_mb(size), sha))
    print("== 版本 ==\n  旧 %s → 新 %s（旧包累计下载 %s）" % (old_ver, ver, old_total))

    print("\n== 计划 ==")
    dst = os.path.join(DOWNLOAD_DIR, new_name)
    print("  COPY  %s -> %s" % (a.exe, dst))
    counter = read(COUNTER_PY)
    if new_name in counter:
        print("  SKIP  计数服务已登记")
    else:
        print("  EDIT  %s 登记 SEEDS(seed=%s)/LABELS" % (COUNTER_PY, old_total or 0))
    for d in HTML_DIRS:
        for page in PAGES:
            p = os.path.join(d, page)
            if os.path.exists(p):
                print("  EDIT  %s 替换 %d 处 0.1.x → %s" % (p, read(p).count(old_ver), ver))
    if not a.apply:
        print("\n(dry-run，未改动。加 --apply 执行)")
        return

    shutil.copy2(a.exe, dst)
    os.chmod(dst, 0o644)
    print("已放包:", dst)

    if new_name not in counter:
        counter = counter.replace("SEEDS = {\n",
            "SEEDS = {\n    '%s': %d,\n" % (new_name, old_total or 0), 1)
        counter = counter.replace("LABELS = {\n",
            "LABELS = {\n    '%s': '千帆一答-桌面版-v%s-windows-x64.exe',\n" % (new_name, ver), 1)
        write(COUNTER_PY, counter)
        print("计数服务已登记")
    subprocess.run(["systemctl", "restart", "geyi-download-counter.service"], check=True)
    time.sleep(2)

    for d in HTML_DIRS:
        for page in PAGES:
            p = os.path.join(d, page)
            if not os.path.exists(p):
                continue
            s = read(p)
            s = s.replace(old_ver, ver)          # 版本号与文件名（文件名里也含版本号）
            write(p, s)
            print("已改:", p)

    print("\n== 自检 ==")
    bad = 0
    for d in HTML_DIRS:
        for page in PAGES:
            p = os.path.join(d, page)
            if not os.path.exists(p):
                continue
            left = read(p).count(old_ver)
            print("  %-52s 旧版本残留 %d" % (p, left))
            bad += left
    for page in PAGES:
        url = "%s/%s" % (SITE, page)
        with urllib.request.urlopen(url, timeout=15) as r:
            body = r.read().decode("utf-8", "ignore")
        print("  %-52s HTTP %s 含新文件 %s" % (url, r.status, new_name in body))
    req = urllib.request.Request("%s/download/%s" % (SITE, new_name), method="HEAD")
    with urllib.request.urlopen(req, timeout=30) as r:
        print("  下载 HEAD: %s  %s  %s" % (r.status, r.headers.get("Content-Length"), r.headers.get("Content-Type")))
    with urllib.request.urlopen("%s/download/count?name=%s" % (SITE, new_name), timeout=10) as r:
        print("  计数: %s" % r.read().decode())
    print("\n自检:", "通过" if bad == 0 else "有 %d 处旧版本残留" % bad)
    sys.exit(0 if bad == 0 else 1)


if __name__ == "__main__":
    main()
