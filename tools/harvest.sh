#!/bin/sh
# 深い面をためる。4本並列。
#   sh tools/harvest.sh <巡番号> [秒数]
# 採れた面はその場で tools/stock に書かれ、5分ごとにコミットして押す。
# 環境ごと消えることがあるので、まとめて最後に、は禁物。
cd /home/user/Games
R=${1:-1}
SEC=${2:-1800}
for i in 1 2 3 4; do
  MIN_PUSH=45 MIN_MANO=0.30 NBOX=6,8 FLOORS=34,62 BEAM=1200 TRIES=5 NODES=6e5 DEPTH=58 \
  node --max-old-space-size=1800 tools/gen-deep.js 20 $SEC $((R*10000+i*331)) 3 \
    tools/stock/deep-r${R}_$i.json > /tmp/h${R}_$i.log 2>&1 &
done
# 走っている間、5分ごとに保存する
( while pgrep -f "tools/gen-deep.js" >/dev/null; do
    sleep 300
    git add tools/stock >/dev/null 2>&1
    git commit -q -m "深い面の在庫（第${R}巡・途中）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RoNZTmHrjmAjHdLLeAM9DZ" >/dev/null 2>&1 \
      && git push -q origin claude/sokoban-auto-generation-vrgili >/dev/null 2>&1 \
      && echo "  [$(date +%H:%M)] 途中保存"
  done ) &
SAVER=$!
wait %1 %2 %3 %4
kill $SAVER 2>/dev/null
node -e '
const fs=require("fs");
let n=0, ps=[];
for(const f of fs.readdirSync("tools/stock")) if(f.startsWith("deep")&&f.endsWith(".json"))
  for(const l of JSON.parse(fs.readFileSync("tools/stock/"+f,"utf8"))){ n++; ps.push(l.p); }
ps.sort((a,b)=>a-b);
console.log("深い在庫 "+n+"面 / 手数 "+(ps[0]||"-")+"〜"+(ps[ps.length-1]||"-")
  +" / 48手以上 "+ps.filter(p=>p>=48).length+"面");
'
git add tools/stock && git commit -q -m "深い面の在庫（第${R}巡）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RoNZTmHrjmAjHdLLeAM9DZ"
git push -q origin claude/sokoban-auto-generation-vrgili && echo "保存して押した"
