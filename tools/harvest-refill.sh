#!/bin/sh
# 重複していた面を差し替えるための採取。
#   sh tools/harvest-refill.sh <巡番号> [秒数]
#
# 足りないのは中くらいの深さ(20〜44手)と、深いところ(45手以上)。
# 4本のうち2本を中くらい、2本を深いところに割り当てる。
# 採れた面はその場で tools/stock に書かれる。環境ごと消えることがあるので、
# まとめて最後に、は禁物。
cd /home/user/Games
R=${1:-1}
SEC=${2:-1800}

# 中くらい(20〜44手)。ここが一番痩せている
for i in 1 2; do
  MIN_PUSH=20 MIN_MANO=0.30 NBOX=4,7 FLOORS=24,48 BEAM=900 TRIES=5 NODES=5e5 DEPTH=46 \
  node --max-old-space-size=1800 tools/gen-deep.js 30 $SEC $((R*20000+i*577)) 3 \
    tools/stock/refill-mid-r${R}_$i.json > /tmp/rf${R}_$i.log 2>&1 &
done
# 深いところ(45手以上)
for i in 3 4; do
  MIN_PUSH=45 MIN_MANO=0.30 NBOX=6,8 FLOORS=34,62 BEAM=1200 TRIES=5 NODES=6e5 DEPTH=58 \
  node --max-old-space-size=1800 tools/gen-deep.js 20 $SEC $((R*20000+i*577)) 3 \
    tools/stock/refill-deep-r${R}_$i.json > /tmp/rf${R}_$i.log 2>&1 &
done
wait
