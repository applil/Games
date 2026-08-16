#!/bin/sh
# 深いのを3本、中くらいを1本、同時に回す
cd /home/user/Games
R=$1
SEC=${2:-1800}
for i in 1 2 3; do
  MIN_PUSH=45 MIN_MANO=0.30 NBOX=6,8 FLOORS=34,62 BEAM=1200 TRIES=5 NODES=6e5 DEPTH=58 \
  node --max-old-space-size=1600 tools/gen-deep.js 20 $SEC $((R*10000+i*331)) 3 \
    tools/stock/deep-r${R}_$i.json > /tmp/h${R}_$i.log 2>&1 &
done
MIN_PUSH=22 node --max-old-space-size=1400 tools/gen-hard.js 200 $SEC $((R*7000+91)) 3 \
  tools/stock/mid-r${R}.json > /tmp/m${R}.log 2>&1 &
( while pgrep -f "tools/gen-deep.js" >/dev/null; do
    sleep 300
    git add tools/stock >/dev/null 2>&1
    git commit -q -m "面の在庫（第${R}巡・途中）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RoNZTmHrjmAjHdLLeAM9DZ" >/dev/null 2>&1 \
      && git push -q origin claude/sokoban-auto-generation-vrgili >/dev/null 2>&1 && echo "  [$(date +%H:%M)] 途中保存"
  done ) &
SAVER=$!
wait %1 %2 %3 %4
kill $SAVER 2>/dev/null
node -e '
const fs=require("fs");
let d=0,m=0,dp=[];
for(const f of fs.readdirSync("tools/stock")){
  if(!f.endsWith(".json")) continue;
  const a=JSON.parse(fs.readFileSync("tools/stock/"+f,"utf8"));
  if(f.startsWith("deep")){ d+=a.length; for(const l of a) dp.push(l.p); } else m+=a.length;
}
dp.sort((a,b)=>a-b);
console.log("深い "+d+"面(48手以上 "+dp.filter(p=>p>=48).length+") / 中くらい "+m+"面");
'
git add tools/stock && git commit -q -m "面の在庫（第${R}巡）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RoNZTmHrjmAjHdLLeAM9DZ"
git push -q origin claude/sokoban-auto-generation-vrgili && echo "保存して押した"
