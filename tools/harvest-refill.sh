#!/bin/sh
# 重複していた面を差し替えるための採取。
#   sh tools/harvest-refill.sh <巡番号> [秒数]
#
# 残っている不足に合わせて割り当てる(2026-08-21 の実測、第2次):
#   35-44手:16面 / 45-49手:7面 / 50手以上:28面
# 浅いところ(12〜24手)はほぼ足りたので外した。
# 採れた面はその場で tools/stock に書かれる。まとめて最後に、は禁物。
#
# 止めるときは pkill -f "^node --max-old-space-size" を使うこと。
# "gen-deep" で止めようとすると、その pkill 自身の命令文に文字列が入っていて
# 自分を撃つ。何度かこれで手順が途中で死んでいる。
cd /home/user/Games
R=${1:-1}
SEC=${2:-1800}

# 35〜44手
MIN_PUSH=35 MIN_MANO=0.30 NBOX=5,7 FLOORS=28,50 BEAM=1000 TRIES=5 NODES=6e5 DEPTH=48 \
node --max-old-space-size=1800 tools/gen-deep.js 25 $SEC $((R*40000+101)) 3 \
  tools/stock/refill-b35-r${R}.json > /tmp/rf${R}_b35.log 2>&1 &

# 45〜49手
MIN_PUSH=45 MIN_MANO=0.30 NBOX=6,8 FLOORS=32,58 BEAM=1200 TRIES=5 NODES=7e5 DEPTH=54 \
node --max-old-space-size=1800 tools/gen-deep.js 20 $SEC $((R*40000+211)) 3 \
  tools/stock/refill-b45-r${R}.json > /tmp/rf${R}_b45.log 2>&1 &

# 50手以上。ここが一番足りないので2本
for i in 1 2; do
  MIN_PUSH=50 MIN_MANO=0.30 NBOX=6,8 FLOORS=36,62 BEAM=1400 TRIES=5 NODES=8e5 DEPTH=62 \
  node --max-old-space-size=1800 tools/gen-deep.js 15 $SEC $((R*40000+i*331)) 3 \
    tools/stock/refill-b50-r${R}_$i.json > /tmp/rf${R}_b50_$i.log 2>&1 &
done
wait
