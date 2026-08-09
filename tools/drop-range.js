'use strict';
/* 出来上がった面リストから、指定した区間をまるごと落とすツール。
 *
 *   node tools/drop-range.js <最初の面> <最後の面> [levels.json]
 *
 * 例) node tools/drop-range.js 5 150
 *     … 第5〜150面を削除し、いままでの第151面が第5面になる。
 *
 * 面の中身は作り直さない。並びをそのまま詰めるだけなので、
 * 遊んだ手応えは元のまま持ち上がる。総数はそのぶん減る。
 */
const fs=require('fs');
const path=require('path');

const from=+process.argv[2], to=+process.argv[3];
const TARGET=process.argv[4]||path.join(__dirname,'..','warehouse','levels.json');
if(!(from>=1&&to>=from)){
  console.error('使い方: node tools/drop-range.js <最初の面> <最後の面> [levels.json]');
  process.exit(1);
}

const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));
const before=data.levels.length;
if(to>before){
  console.error(`第${to}面はありません (全${before}面)`);
  process.exit(1);
}

const dropped=data.levels.slice(from-1, to);
data.levels=data.levels.slice(0,from-1).concat(data.levels.slice(to));
data.count=data.levels.length;
data.dropped=(data.dropped||[]).concat([[from,to]]);
fs.writeFileSync(TARGET, JSON.stringify(data));

const avg=a=>a.length?(a.reduce((x,y)=>x+y,0)/a.length):0;
console.log(`第${from}〜${to}面の ${dropped.length}面を削除しました (${before}面 → ${data.levels.length}面)`);
console.log(`  消した区間の平均: 最短${avg(dropped.map(l=>l.p)).toFixed(1)}手 / 罠率${avg(dropped.map(l=>l.tr)).toFixed(0)}%`);
const now=data.levels[from-1];
if(now) console.log(`  新しい第${from}面: 最短${now.p}手 罠率${now.tr}% 素直に詰む${now.g}/3 (元の第${to+1}面)`);
