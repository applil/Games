#!/bin/sh
# 重複していた面を差し替えるための採取。
#   sh tools/harvest-refill.sh <巡番号> [秒数]
#
# 不足している帯に合わせて4本を割り当てる(2026-08-21 の実測):
#   12-19手:10面 / 25-34手:15面 / 35-44手:17面 / 45手以上:40面
# 深いところが一番足りないので2本を当てる。
# 採れた面はその場で tools/stock に書かれる。まとめて最後に、は禁物。
cd /home/user/Games
R=${1:-1}
SEC=${2:-1800}

# 浅いところ(12〜19手)。小さい盤
MIN_PUSH=12 MIN_MANO=0.30 NBOX=3,5 FLOORS=14,30 BEAM=500 TRIES=6 NODES=3e5 DEPTH=24 \
node --max-old-space-size=1500 tools/gen-deep.js 40 $SEC $((R*30000+101)) 3 \
  tools/stock/refill-low-r${R}.json > /tmp/rf${R}_low.log 2>&1 &

# 中くらい(25〜44手)
MIN_PUSH=25 MIN_MANO=0.30 NBOX=4,7 FLOORS=24,48 BEAM=900 TRIES=5 NODES=5e5 DEPTH=46 \
node --max-old-space-size=1800 tools/gen-deep.js 30 $SEC $((R*30000+211)) 3 \
  tools/stock/refill-mid-r${R}.json > /tmp/rf${R}_mid.log 2>&1 &

# 深いところ(48手以上)。ここが一番足りないので2本
for i in 1 2; do
  MIN_PUSH=48 MIN_MANO=0.30 NBOX=6,8 FLOORS=34,62 BEAM=1300 TRIES=5 NODES=7e5 DEPTH=60 \
  node --max-old-space-size=1800 tools/gen-deep.js 20 $SEC $((R*30000+i*331)) 3 \
    tools/stock/refill-deep-r${R}_$i.json > /tmp/rf${R}_deep$i.log 2>&1 &
done
wait
