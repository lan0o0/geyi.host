# 格一科技官网（geyi.host）

郑州格一网络科技有限公司官网 —— 纯静态站点（HTML / CSS / 原生 JS），由 nginx 直接托管。
线上地址：<https://geyi.host>（www 同样可访问）

本站产品：《千帆一答》AI 面试实时助手（Android App + Windows 桌面版，另见文末相关仓库）。

---

## 1. 线上形态

| 项 | 值 |
|---|---|
| Web 服务器 | nginx（Ubuntu 20.04，1.18.0） |
| 站点根目录 | `/var/www/html`（**服务器上**，本仓库是它的工作副本） |
| 域名 / 证书 | `geyi.host`、`www.geyi.host`，Let's Encrypt（certbot 自动续期） |
| 站点配置 | 服务器 `/etc/nginx/conf.d/geyi.conf`（**不在本仓库**） |
| 备案 | 豫ICP备2026039037号-1 · 豫公网安备41010502007988号 |

`geyi.conf` 里除静态托管外还有两条转发，改页面时别误删：

- `location /api/` → 反代本机 `127.0.0.1:8080`（后端 payment-backend，见文末）
- `location /download/` → 反代本机 `127.0.0.1:8099`（下载计数服务，见第 4 节）

---

## 2. 页面与目录

| 文件 | 线上路径 | 说明 |
|---|---|---|
| `index.html` | `/` | 首页：hero、产品矩阵 teaser、订阅动态 |
| `products.html` | `/products.html` | 产品矩阵：卡片 + 详情「抽屉」（Drawer），千帆一答可下载 |
| `qianfan-yida.html` | `/qianfan-yida.html` | **千帆一答产品页**：功能 / 适用系统 / 价格与会员权益 / 如何购买 / 如何生效 / 售后与联系方式 / 双端下载（为支付宝「电脑网站支付」审核准备） |
| `about.html` | `/about.html` | 技术理念与团队 |
| `contact.html` | `/contact.html` | 联系我们（留言表单） |
| `pay/done.html` | `/pay/done.html` | 支付宝电脑网站支付**同步跳转页**（`alipay.return-url` 指向这里） |

```
.
├── index.html  products.html  qianfan-yida.html  about.html  contact.html
├── pay/done.html                 # 支付完成回跳页
├── css/style.css                 # 全站样式（含导航下拉、抽屉下载区）
├── js/main.js                    # 交互：抽屉 data-* 驱动、下载次数、导航、订阅表单
├── assets/  jpg/                 # 图标与产品截图（中文文件名可用，nginx 按 UTF-8 处理）
├── robots.txt  sitemap.xml       # SEO（新增页面记得进 sitemap）
├── tools/baidu-push.sh           # 百度普通收录主动推送（只入库，不上线）
└── sitecheck/                    # jsdom 回归脚本（只入库，不上线）
```

---

## 3. 发布流程（在服务器上操作）

```bash
cd /home/ubuntu/giyi.host
# 1) 改文件后部署到站点根目录（html 进根、css/js 进各自目录）
install -m 644 -o root -g root index.html products.html /var/www/html/
install -m 644 -o root -g root css/style.css /var/www/html/css/
install -m 644 -o root -g root js/main.js    /var/www/html/js/
# 2) 回归（见第 5 节）
# 3) 提交并推送（push 必须走 ssh.github.com:443，本机 github.com:22/443 不通）
sudo -u ubuntu git add -A
sudo -u ubuntu git -c user.name="lan0o0" -c user.email="lan0o0@users.noreply.github.com" commit -m "..."
sudo -u ubuntu git push origin main
```

**两条硬性约定**

1. **改了 `css/style.css` 或 `js/main.js`，必须同步更新所有页面里的 `?v=` 版本号**
   （`href="css/style.css?v=20261010155821"` / `src="js/main.js?v=... "`）。
   否则用户浏览器会继续用旧 JS —— 典型症状是「页面明明改了，用户却看不到新块」。
2. 只入库、不上线的文件（`tools/`、`sitecheck/`、`.trae-html-share-packages/`、`README.md`）
   不要 `install` 进 `/var/www/html`。

### 缓存策略（2026-10-10 起）

nginx 侧（`geyi.conf`）：

```nginx
location ~* \.html$      { add_header Cache-Control "no-cache, must-revalidate"; try_files $uri =404; }
location ~* \.(css|js)$  { add_header Cache-Control "public, max-age=600";           try_files $uri =404; }
```

HTML 每次向服务器校验 → 改版即时生效；css/js 靠 `?v=` 换版本号失效。
注意正则 location 优先级高于普通前缀 location，改动后要复核 `/download/`、`/api/` 仍正常。

---

## 4. 安装包下载与下载计数

- 安装包实体放在服务器 `/var/www/download/`（**不在本仓库**，体积大）
- 页面里用 `/download/<文件名>` 链接：

| 平台 | 链接 |
|---|---|
| Windows 桌面版 | `/download/qianfan-yida-desktop-v0.1.7-windows-x64.exe` |
| Android | `/download/qianfan-yida-v1.0.53.apk` |

链路：nginx `location /download/` → 计数服务 `127.0.0.1:8099`（`/opt/geyi-downloads/counter.py`，
systemd 单元 `geyi-download-counter.service`）计数 +1 → 返回 `X-Accel-Redirect: /_apk/<文件>` →
由 nginx 直接发文件（支持 Range 断点续传，大文件不经过 Python 进程）。

- 计数接口：`GET /download/count?name=<文件名>` → `{total, site_hits, seed, size, updated_at}`；
  不带 `name` 返回全部。页面用 `data-dl-count="<文件名>"` 占位，前端 fetch 后填数字。
- 计数口径：`total = seed（第三方侧历史数）+ 本站命中数`；`HEAD` 不计数；Range 续传与重复点击会重复计数，
  因此它是**下载次数**而非「独立用户数」。
- **新增文件类型时三处都要改**：`counter.py` 的 `MIME_BY_EXT` / `SEEDS` / `LABELS`，
  以及 nginx `location /_apk/` 里显式的 `types{}` 块（否则 `.exe` 会被当成 APK 发送）。

---

## 5. 回归脚本（无头浏览器不可用时用 jsdom）

```bash
cd sitecheck && npm i jsdom
node qianfan_page_check.js      # 千帆一答产品页：审核要素齐全、下载次数渲染、脚本无报错
node products_drawer_check.js   # 产品矩阵抽屉：千帆一答隐藏顶图 / 双端下载按钮与计数 / 详情按钮 + 反向断言
```

脚本读的是**线上目录 `/var/www/html`** 里的那份文件（先部署再跑），避免「改了仓库没同步」的假通过。

---

## 6. SEO 与运营

- `sitemap.xml` 新增页面要同步收录；`robots.txt` 已屏蔽 `/api/`、`/download/`
- 百度推送：`tools/baidu-push.sh`（token 放服务器 `/root/.baidu-token`，600 权限）
  - `./baidu-push.sh` 只推新增 URL；`--force` 全量；`--list` 干跑
- 站点验证文件（`baidu_verify_codeva-*.html`、`4edaa8d6*.txt`）**切勿删除**

---

## 7. 相关仓库

| 仓库 | 说明 |
|---|---|
| `lan0o0/Interview-tool` | 千帆一答后端（Spring Boot 3 + MySQL）与 Android App。后端部署在服务器 8080，`/api/` 反代到它；电脑网站支付接口 `POST /api/payment/orders/page` 等 |
| `lan0o0/Interview-tool-desktop` | 千帆一答 PC 客户端（Tauri + React），充值走电脑网站支付 → 打开收银台扫码 |

**改价必须两处同步**：本仓库 `qianfan-yida.html` 的价格与权益说明，与后端数据库
`membership_plans`（当前：1 小时 ¥29 / 2 小时 ¥49 / 3 小时 ¥59）保持一致。
