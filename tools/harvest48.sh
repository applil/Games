#!/bin/sh
# 48手以上だけを狙って採る。900面台(48手以上100面)を埋めるため。
#   sh tools/harvest48.sh <巡番号> [秒数]
cd /home/user/Games
R=${1:-1}
SEC=${2:-1800}
for i in 1 2 3 4; do
  MIN_PUSH=48 MIN_MANO=0.30 NBOX=6,8 FLOORS=34,62 BEAM=1400 TRIES=5 NODES=7e5 DEPTH=62 \
  node --max-old-space-size=1800 tools/gen-deep.js 20 $SEC $((R*10000+i*331)) 3 \
    tools/stock/deep-d${R}_$i.json > /tmp/d${R}_$i.log 2>&1 &
done
( while pgrep -f "tools/gen-deep.js" >/dev/null; do
    sleep 300
    git add tools/stock >/dev/null 2>&1
    git commit -q -m "深い面の在庫（48手以上・第${R}巡・途中）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RoNZTmHrjmAjHdLLeAM9DZ" >/dev/null 2>&1 \
      && git push -q origin claude/sokoban-auto-generation-vrgili >/dev/null 2>&1 && echo "  [$(date +%H:%M)] 途中保存"
  done ) &
SAVER=$!
wait %1 %2 %3 %4
kill $SAVER 2>/dev/null
node -e '
const fs=require("fs");
let d=0, dp=[];
for(const f of fs.readdirSync("tools/stock")){ if(!f.startsWith("deep")||!f.endsWith(".json")) continue;
  const a=JSON.parse(fs.readFileSync("tools/stock/"+f,"utf8")); d+=a.length; a.forEach(l=>dp.push(l.p)); }
dp.sort((a,b)=>a-b);
console.log("深い "+d+"面 / 48手以上 "+dp.filter(p=>p>=48).length+"面 / 最深"+dp[dp.length-1]+"手");
'
git add tools/stock && git commit -q -m "深い面の在庫（48手以上・第${R}巡）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RoNZTmHrjmAjHdLLeAM9DZ"
git push -q origin claude/sokoban-auto-generation-vrgili && echo "保存して押した"
