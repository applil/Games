#!/bin/sh
# 中くらいの面(22手以上)をためる。従来方式なので速い
cd /home/user/Games
R=${1:-1}
SEC=${2:-900}
for i in 1 2; do
  MIN_PUSH=22 node --max-old-space-size=1500 tools/gen-hard.js 200 $SEC $((R*7000+i*137)) 3 \
    tools/stock/mid-r${R}_$i.json > /tmp/m${R}_$i.log 2>&1 &
done
wait
node -e '
const fs=require("fs");
let n=0, ps=[];
for(const f of fs.readdirSync("tools/stock")) if(f.startsWith("mid")&&f.endsWith(".json"))
  for(const l of JSON.parse(fs.readFileSync("tools/stock/"+f,"utf8"))){ n++; ps.push(l.p); }
ps.sort((a,b)=>a-b);
console.log("中くらいの在庫 "+n+"面 / 手数 "+(ps[0]||"-")+"〜"+(ps[ps.length-1]||"-"));
'
git add tools/stock && git commit -q -m "中くらいの面の在庫（第${R}巡）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RoNZTmHrjmAjHdLLeAM9DZ" && git push -q -u origin claude/sokoban-auto-generation-vrgili 2>&1|tail -1
