# 站点回归脚本（jsdom）

无头浏览器不可用时，用 jsdom 对**线上目录** `/var/www/html` 里的页面做结构与交互断言。

用法：

    cd sitecheck && npm i jsdom && node qianfan_page_check.js

- `qianfan_page_check.js`：千帆一答产品页 —— 下载计数渲染（打桩 /download/count）、
  审核要求段落齐全、三档价格、无脚本错误。
- 改完页面先 `install -m 644 <文件> /var/www/html/`，脚本读的是线上那份，避免「改了仓库没同步」的假通过。
