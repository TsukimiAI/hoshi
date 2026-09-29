#!/bin/sh
set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
id="$(basename "$PWD")"
case "$PWD" in
  "$root/plugins/$id") ;;
  *)
    echo "请在 plugins/<id> 目录执行" >&2
    exit 1
    ;;
esac
if ! printf '%s' "$id" | grep -Eq '^[A-Za-z0-9_-]+$' || [ "$id" = "_template" ]; then
  echo "插件 id 无效" >&2
  exit 1
fi
echo "请点工作台「上线」" >&2
rm -f .hoshi-publish.ok .hoshi-publish.err
printf 'publish\n' > .hoshi-publish
i=0
while [ "$i" -lt 60 ]; do
  if [ -f .hoshi-publish.ok ]; then
    echo "已上线 $id"
    exit 0
  fi
  if [ -s .hoshi-publish.err ]; then
    cat .hoshi-publish.err >&2
    exit 1
  fi
  i=$((i + 1))
  sleep 1
done
echo "上线超时，请点工作台「上线」" >&2
exit 1
