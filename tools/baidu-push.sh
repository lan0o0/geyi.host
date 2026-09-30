#!/usr/bin/env bash
# 百度「普通收录」API 主动推送（智能模式：只推没推过的 URL，省配额）
#
# 新站 API 配额通常只有 10 条/天且当日不累计 —— 重复推同一批 URL 等于白扔配额。
# 本脚本记住已成功推送的 URL，默认只推新增页面。
#
# 用法：
#   ./baidu-push.sh            只推新增 URL（日常用这个）
#   ./baidu-push.sh --force    强制推送 sitemap 里的全部 URL（页面内容大改时用）
#   ./baidu-push.sh --list     只列出会发生什么，不真的推送
#
# 前置：token 写入 /root/.baidu-token（chmod 600），或临时 export BAIDU_TOKEN=xxx
set -euo pipefail

SITE="https://geyi.host"
SITEMAP="https://geyi.host/sitemap.xml"
RECORD="/root/.baidu-pushed.txt"          # 已成功推送的 URL 记录
TOKEN="${BAIDU_TOKEN:-$(cat /root/.baidu-token 2>/dev/null || true)}"

MODE="incremental"
case "${1:-}" in
  --force) MODE="force" ;;
  --list)  MODE="list" ;;
  "")      ;;
  *) echo "未知参数：$1（可用 --force / --list）" >&2; exit 2 ;;
esac

if [ -z "${TOKEN}" ] && [ "${MODE}" != "list" ]; then
  echo "缺少 token。请先：echo '你的token' > /root/.baidu-token && chmod 600 /root/.baidu-token" >&2
  exit 1
fi

mapfile -t ALL < <(curl -s "$SITEMAP" | grep -oP '(?<=<loc>)[^<]+')
touch "$RECORD"

if [ "${MODE}" = "force" ]; then
  TARGET=("${ALL[@]}")
else
  TARGET=()
  for u in "${ALL[@]}"; do
    grep -qxF "$u" "$RECORD" || TARGET+=("$u")
  done
fi

if [ "${#TARGET[@]}" -eq 0 ]; then
  echo "sitemap 里 ${#ALL[@]} 个 URL 都已推送过，无需重复推送（省配额）。"
  echo "页面内容有较大更新时用 --force 重推。"
  exit 0
fi

echo "sitemap 共 ${#ALL[@]} 个 URL，本次推送 ${#TARGET[@]} 个："
printf '  %s\n' "${TARGET[@]}"
[ "${MODE}" = "list" ] && exit 0

RESP="$(printf '%s\n' "${TARGET[@]}" | curl -s -H 'Content-Type:text/plain' --data-binary @- \
  "http://data.zz.baidu.com/urls?site=${SITE}&token=${TOKEN}")"
echo "百度返回：${RESP}"

# 仅在接口报告成功推送时才记入历史，避免失败被误记为已推
if printf '%s' "${RESP}" | grep -q '"success"'; then
  SUCCESS="$(printf '%s' "${RESP}" | grep -oP '(?<="success":)\d+')"
  if [ "${SUCCESS:-0}" -gt 0 ]; then
    printf '%s\n' "${TARGET[@]}" >> "$RECORD"
    echo "已记录到 ${RECORD}（下次不会再重复推送这些 URL）"
  fi
fi
