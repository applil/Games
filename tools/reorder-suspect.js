'use strict';
/* モデレーション用に、面の並びを「怪しい順」に組み替えるツール。
 *
 *   node tools/reorder-suspect.js <この面以降を対象にする> [levels.json]
 *
 * 対象の面を怪しい順に並べて先頭へ持ってくる。対象外の面はその後ろにそのまま続ける。
 * 面は1つも増減しない。元の面番号は orig に控えるので、
 * tools/restore-order.js でいつでも元通りに戻せる。
 */
const fs=require('fs');
const path=require('path');
const {suspect}=require(path.join(__dirname,'suspect.js'));

const FROM=+(process.argv[2]||66);
const TARGET=process.argv[3]||path.join(__dirname,'..','warehouse','levels.json');
const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));

// まだ控えを持っていなければ、いまの並びを元とする
data.levels.forEach((l,i)=>{ if(l.orig===undefined) l.orig=i+1; });
if(data.reordered){ console.error('すでに並べ替え済みです。先に tools/restore-order.js で戻してください。'); process.exit(1); }

const head=data.levels.filter(l=>l.orig<FROM);          // 対象外(そのまま後ろへ)
const body=data.levels.filter(l=>l.orig>=FROM);
body.forEach(l=>{ l._s=suspect(l.b).score; });
body.sort((a,b)=>b._s-a._s||a.orig-b.orig);
body.forEach(l=>{ delete l._s; });

data.levels=body.concat(head);
data.reordered={from:FROM, at:'moderation'};
data.count=data.levels.length;
fs.writeFileSync(TARGET, JSON.stringify(data));

console.log(`第${FROM}面以降の ${body.length}面 を怪しい順に先頭へ並べました (全${data.count}面)`);
console.log(`第${body.length+1}面から先は、元の第1〜${FROM-1}面がそのまま続きます`);
console.log('\n先頭20面');
console.log(' 新面  元面  点数   広さ 床 荷物 床/荷');
for(let i=0;i<20;i++){
  const l=data.levels[i], s=suspect(l.b);
  console.log(String(i+1).padStart(4)+String(l.orig).padStart(6)+String(s.score).padStart(7)
    +String(s.area).padStart(6)+String(s.floors).padStart(4)+String(s.boxes).padStart(4)
    +s.floorsPerBox.toFixed(1).padStart(6));
}
