#!/bin/sh
# 難しい面を4本並列で作る。
#   sh tools/gen-hard-parallel.sh [1本あたりの欲しい数] [秒数] [出力先ディレクトリ]
# 4コアあるので、種を変えた4プロセスを同時に走らせる。
N=${1:-10}
SEC=${2:-300}
DIR=${3:-/tmp/hard}
mkdir -p "$DIR"
for i in 1 2 3 4; do
  node --max-old-space-size=3072 tools/gen-hard.js "$N" "$SEC" "$((20260900 + i * 7919))" 3 "$DIR/part$i.json" > "$DIR/part$i.log" 2>&1 &
done
wait
node -e '
const fs=require("fs"), dir=process.argv[1];
const all=[];
for(const f of fs.readdirSync(dir)) if(f.endsWith(".json"))
  for(const l of JSON.parse(fs.readFileSync(dir+"/"+f,"utf8"))) all.push(l);
const byId=new Map(all.map(l=>[l.id,l]));
const out=[...byId.values()].sort((a,b)=>b.p-a.p);
out.forEach(l=>delete l.boxes);
fs.writeFileSync(dir+"/all.json", JSON.stringify(out,null,1));
console.log(out.length+"面 (重複を除く) → "+dir+"/all.json");
console.log(" 手数 荷物  盤    経路  囮  強制  形");
for(const l of out){ const r=l.b.split("/");
  console.log(String(l.p).padStart(4)+String(l.nbox).padStart(4)
   +((r[0].length-2)+"x"+(r.length-2)).padStart(8)+String(l.mano).padStart(6)
   +String(l.dec).padStart(6)+String(l.fo).padStart(6)+"  "+l.sh); }
' "$DIR"
