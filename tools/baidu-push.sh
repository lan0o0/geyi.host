#!/usr/bin/env bash
# 百度「普通收录」API 主动推送：把 sitemap.xml 里的全部 URL 一次性推给百度
#
# 用法（二选一）：
#   BAIDU_TOKEN=你的token ./baidu-push.sh
#   echo '你的token' > /root/.baidu-token && chmod 600 /root/.baidu-token && ./baidu-push.sh
#
# 返回 JSON 各字段含义：
#   success     本次成功推送的条数
#   remain      今日剩余推送配额
#   not_same_site  /  not_valid   被拒绝的 URL（域名不符 / 格式非法）
set -euo pipefail

SITE="https://geyi.host"
TOKEN="${BAIDU_TOKEN:-$(cat /root/.baidu-token 2>/dev/null || true)}"
if [ -z "${TOKEN}" ]; then
  echo "缺少 token。请先：echo '你的token' > /root/.baidu-token && chmod 600 /root/.baidu-token" >&2
  exit 1
fi

urls="$(curl -s "https://geyi.host/sitemap.xml" | grep -oP '(?<=<loc>)[^<]+')"
echo "待推送 URL："
echo "${urls}" | sed 's/^/  /'

echo "${urls}" | curl -s -H 'Content-Type:text/plain' --data-binary @- \
  "http://data.zz.baidu.com/urls?site=${SITE}&token=${TOKEN}"
echo
