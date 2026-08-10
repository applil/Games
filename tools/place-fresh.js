'use strict';
/* モデレーションで残った新規面を、本編に散らして入れるツール。
 *
 *   node tools/place-fresh.js <消す面のid,...> [levels.json]
 *
 * 1. ✕が付いた面を消す
 * 2. 並びを元に戻す(orig順)
 * 3. fresh:1 の面を難易度順に並べ、本編に等間隔で差し込む
 * 差し込んだあと orig は振り直す。
 */
const fs=require('fs');
const path=require('path');

const DROP=new Set((process.argv[2]||'').split(',').filter(Boolean));
const TARGET=process.argv[3]||path.join(__dirname,'..','warehouse','levels.json');

const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));
const before=data.levels.length;

// 1. ✕を消す
const dropped=data.levels.filter(l=>DROP.has(l.id));
data.levels=data.levels.filter(l=>!DROP.has(l.id));
for(const id of DROP) if(!dropped.some(l=>l.id===id)) console.log('  見つかりません: '+id);

// 2. 元の並びに戻す
data.levels.sort((a,b)=>a.orig-b.orig);

// 3. 新規面を抜き出して、難易度順に
const fresh=data.levels.filter(l=>l.fresh);
const body =data.levels.filter(l=>!l.fresh);
fresh.sort((a,b)=>a.k-b.k||a.p-b.p);

// 本編のどこに差し込むか。
// 新しい面はどれも最短6〜16手で、終盤(20手超)の面と並べると格が違ってしまう。
// チュートリアル(第1〜4面)と、20手超が始まる終盤は避けて、その間に等間隔で置く。
const HEAD=4;
let TAIL=body.length;
for(let i=0;i<body.length;i++) if(body[i].p>=20){ TAIL=i; break; }
// 差し込むと後ろがずれるので、ずれたあとの面番号で等間隔になるよう先に決める
const endAfter=TAIL+fresh.length;
const want=fresh.map((_,i)=>HEAD+Math.round((endAfter-HEAD)*(i+1)/(fresh.length+1)));
console.log(`第${HEAD+1}面〜第${endAfter}面のあいだに置きます (終盤${body.length-TAIL}面はそのまま)\n`);

const out=body.slice();
fresh.forEach((lv,i)=>{ out.splice(want[i]-1, 0, lv); });

data.levels=out;
data.levels.forEach((l,i)=>{ l.orig=i+1; });
delete data.reordered;
data.count=data.levels.length;
fs.writeFileSync(TARGET, JSON.stringify(data));

console.log(`✕を${dropped.length}面 消しました`);
dropped.forEach(l=>console.log('  '+l.id+' 最短'+l.p+'手 '+l.sh));
console.log(`\n新規${fresh.length}面を本編に差し込みました (${before}面 → ${data.count}面)`);
const at=id=>data.levels.findIndex(l=>l.id===id)+1;
console.log('\n 面   最短 運搬 mano 罠率  形');
fresh.forEach(l=>{
  console.log(String(at(l.id)).padStart(4)+String(l.p).padStart(6)+String(l.carry).padStart(5)
    +String(l.mano).padStart(6)+String(l.tr).padStart(5)+'  '+l.sh);
});
