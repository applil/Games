'use strict';
/* 301〜800面の並べ直し。
 *
 * 百面ごとに独立して手数順に並べたので、章の終わりが一番重く、次の章の頭で
 * いったん軽くなっていた(300→301で14手→10手、500→501で23手→20手、など)。
 * 章をまたぐたびに一息つけてしまうので、これを消す。
 *
 * やること: 各百面の10・28・49・67・92番目に置いた「山」(飛び抜けて重い面)は
 * その場に残したまま、残り495面を301〜800の通しで手数順に並べ直す。
 * 章ごとの中央値は変わらず、境目の後退だけが消える。
 *
 * 1〜300面と801〜1000面には触らない。ID も変えないので、
 * クリア履歴も自己ベストもそのまま残る。
 *
 *   node tools/reorder-301.js [--write]
 */
const fs=require('fs');
const path=require('path');

const FILE=path.join(__dirname,'..','warehouse','levels.json');
const data=JSON.parse(fs.readFileSync(FILE,'utf8'));
const L=data.levels;
if(L.length!==1000) throw new Error('1000面ではありません: '+L.length);

const FROM=300, TO=800;                       // 0起点。301面〜800面
const SLOT=[9,27,48,66,91];                   // 百面の中で山を置いた位置
const spike=new Set();
for(let b=FROM;b<TO;b+=100) SLOT.forEach(s=>spike.add(b+s));

const before=L.slice(FROM,TO).map(x=>x.p);

// 山以外を通しで並べ直す。手数が同じときは、荷物が少なく・盤が小さく・
// 経路のズレが小さいほうを先に。同じ手数でも素直な面から出す
const base=[];
for(let i=FROM;i<TO;i++) if(!spike.has(i)) base.push(L[i]);
base.sort((a,b)=>
  a.p-b.p
  || (a.nbox||0)-(b.nbox||0)
  || (a.floors||0)-(b.floors||0)
  || (a.mano||0)-(b.mano||0)
  || (a.id<b.id?-1:a.id>b.id?1:0));

let k=0;
for(let i=FROM;i<TO;i++) if(!spike.has(i)) L[i]=base[k++];
if(k!==base.length) throw new Error('数が合いません');

// 中身が入れ替わっただけで、面の集合が変わっていないことを確かめる
const ids=new Set(L.map(x=>x.id));
if(ids.size!==1000) throw new Error('IDが重複しました');

const after=L.slice(FROM,TO).map(x=>x.p);
const sum=a=>a.reduce((x,y)=>x+y,0);
if(sum(before)!==sum(after)) throw new Error('手数の合計が変わりました');

console.log('--- 章ごと(山を除いた本体) ---');
for(let b=FROM;b<TO;b+=100){
  const g=[];
  for(let i=b;i<b+100;i++) if(!spike.has(i)) g.push(L[i].p);
  console.log(`${b+1}-${b+100}: ${g[0]}→${g[g.length-1]}手 (中央${g[Math.floor(g.length/2)]})`);
}
console.log('--- 章の境目 ---');
for(const n of [300,400,500,600,700,800]){
  const a=L[n-1].p, c=L[n].p;
  console.log(`第${n}面 ${a}手 → 第${n+1}面 ${c}手` + (c<a ? '   ← まだ下がる' : ''));
}

if(process.argv.includes('--write')){
  fs.writeFileSync(FILE, JSON.stringify(data));
  console.log('\n書き出しました: '+FILE);
} else {
  console.log('\n(下見です。書き込むには --write を付けてください)');
}
