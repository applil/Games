#!/bin/sh
# 深い面をためる。4本並列。採れたぶんはリポジトリに置いて、巡ごとにコミットする
cd /home/user/Games
R=${1:-1}
SEC=${2:-1800}
for i in 1 2 3 4; do
  MIN_PUSH=45 MIN_MANO=0.30 NBOX=6,8 FLOORS=34,62 BEAM=1200 TRIES=5 NODES=6e5 DEPTH=58 \
  node --max-old-space-size=1800 tools/gen-deep.js 20 $SEC $((R*10000+i*331)) 3 \
    tools/stock/deep-r${R}_$i.json > /tmp/h${R}_$i.log 2>&1 &
done
wait
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
Claude-Session: https://claude.ai/code/session_01RoNZTmHrjmAjHdLLeAM9DZ" && git push -q -u origin claude/sokoban-auto-generation-vrgili 2>&1 | tail -1
echo "コミットして押した"
