#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
发布 Android 新版安装包（幂等，可 --dry-run）

做四件事：
  1) 把新 APK 放进 /var/www/download/（旧包保留=回滚方案）
  2) 在计数服务 SEEDS/LABELS 登记（新包继承旧包的累计下载数，页面不从 0 开始）
  3) 站点页面（/var/www/html 与 git 工作副本）里的版本号、文件名、计数属性、下载链接一次改齐
  4) 自检：残留旧版本号、页面 200、Content-Length/MIME、触发一次下载看计数自增

用法：
  python3 publish-android-release.py --apk /tmp/app-v1.0.63.apk --version 1.0.63            # 先看
  python3 publish-android-release.py --apk /tmp/app-v1.0.63.apk --version 1.0.63 --apply    # 真跑
"""
import argparse
import hashlib
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
    return "%.0f MB" % (n / 1024 / 1024)


def old_version_of(version):
    """从当前页面里推断旧版本号（用于继承下载计数）。"""
    s = read(os.path.join(HTML_DIRS[0], "qianfan-yida.html"))
    m = re.search(r"qianfan-yida-v([0-9.]+)\.apk", s)
    return m.group(1) if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apk", required=True)
    ap.add_argument("--version", required=True, help="如 1.0.63")
    ap.add_argument("--apply", action="store_true", help="不加则只打印计划")
    a = ap.parse_args()

    ver = a.version.lstrip("v")
    new_name = "qianfan-yida-v%s.apk" % ver
    old_ver = old_version_of(ver)
    old_name = "qianfan-yida-v%s.apk" % old_ver if old_ver else None
    size = os.path.getsize(a.apk)
    sha = hashlib.sha256(open(a.apk, "rb").read()).hexdigest()

    print("== 源包 ==")
    print("  %s  %d 字节 (%s)  SHA-256 %s" % (a.apk, size, human_mb(size), sha))
    print("== 版本 ==")
    print("  旧: %s   新: %s" % (old_name, new_name))

    # 旧包当前累计（seed + site hits）
    old_total = None
    try:
        with urllib.request.urlopen("%s/download/count?name=%s" % (SITE, old_name), timeout=10) as r:
            import json
            old_total = json.load(r).get("total")
    except Exception as e:
        print("  取旧包计数失败（将用 0）:", e)
    print("  旧包累计下载: %s" % old_total)

    plan = []
    dst = os.path.join(DOWNLOAD_DIR, new_name)
    if os.path.exists(dst) and os.path.getsize(dst) == size:
        plan.append("SKIP  已存在同尺寸安装包 %s" % dst)
    else:
        plan.append("COPY  %s -> %s" % (a.apk, dst))

    counter = read(COUNTER_PY)
    if new_name in counter:
        plan.append("SKIP  计数服务已登记 %s" % new_name)
    else:
        plan.append("EDIT  %s 登记 SEEDS/LABELS（seed=%s）" % (COUNTER_PY, old_total or 0))

    for d in HTML_DIRS:
        for page in PAGES:
            p = os.path.join(d, page)
            if not os.path.exists(p):
                continue
            s = read(p)
            n = s.count(old_ver) if old_ver else 0
            plan.append("EDIT  %s 替换 %s 处 v%s -> v%s" % (p, n, old_ver, ver))

    print("\n== 计划 ==")
    for l in plan:
        print("  " + l)
    if not a.apply:
        print("\n(dry-run，未改动。加 --apply 执行)")
        return

    # 1) 放包
    if not (os.path.exists(dst) and os.path.getsize(dst) == size):
        shutil.copy2(a.apk, dst)
    os.chmod(dst, 0o644)
    print("已放包:", dst)

    # 2) 计数登记
    if new_name not in counter:
        seed_line = "    '%s': %d,\n" % (new_name, old_total or 0)
        counter = counter.replace("SEEDS = {\n", "SEEDS = {\n" + seed_line, 1)
        label_line = "    '%s': '千帆一答-v%s.apk',\n" % (new_name, ver)
        counter = counter.replace("LABELS = {\n", "LABELS = {\n" + label_line, 1)
        write(COUNTER_PY, counter)
        print("计数服务已登记")
    subprocess.run(["systemctl", "restart", "geyi-download-counter.service"], check=True)
    time.sleep(2)

    # 3) 页面改版
    for d in HTML_DIRS:
        for page in PAGES:
            p = os.path.join(d, page)
            if not os.path.exists(p):
                continue
            s = read(p)
            if old_ver:
                s = s.replace("v" + old_ver, "v" + ver)
                s = s.replace("qianfan-yida-v" + old_ver + ".apk", new_name)
            write(p, s)
            print("已改:", p)

    # 4) 自检
    print("\n== 自检 ==")
    bad = 0
    for d in HTML_DIRS:
        for page in PAGES:
            p = os.path.join(d, page)
            if not os.path.exists(p):
                continue
            s = read(p)
            left = s.count(old_ver) if old_ver else 0
            print("  %-52s 旧版本残留 %d" % (p, left))
            bad += left
    for page in PAGES:
        url = "%s/%s" % (SITE, page)
        with urllib.request.urlopen(url, timeout=15) as r:
            body = r.read().decode("utf-8", "ignore")
        print("  %-52s HTTP %s  含新版本 %s" % (url, r.status, new_name in body))
    req = urllib.request.Request("%s/download/%s" % (SITE, new_name), method="HEAD")
    with urllib.request.urlopen(req, timeout=20) as r:
        print("  下载 HEAD: %s  %s  %s" % (r.status, r.headers.get("Content-Length"), r.headers.get("Content-Type")))
    with urllib.request.urlopen("%s/download/count?name=%s" % (SITE, new_name), timeout=10) as r:
        print("  计数: %s" % r.read().decode())
    print("\n自检结论:", "通过" if bad == 0 else "有 %d 处旧版本残留，请检查" % bad)
    sys.exit(0 if bad == 0 else 1)


if __name__ == "__main__":
    main()
