'use strict';
/* モデレーションで付けた ★ と ✕ を突き合わせて、何が両者を分けているか調べるツール。
 *
 *   node tools/analyse-moderation.js <moderation.json>
 *
 * 面ごとに、記録に入っていない指標も測り直す:
 *   歩数(押し手の間に歩く距離) / 床の広さ / 荷物の密度 / 遊ばない床の割合 など
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const X=require(path.join(__dirname,'xsb.js'));

const FILE=process.argv[2];
if(!FILE){ console.error('使い方: node tools/analyse-moderation.js <moderation.json>'); process.exit(1); }
const items=JSON.parse(fs.readFileSync(FILE,'utf8'));

// 人がaからbまで歩く最短歩数(荷物は壁として扱う)
function walk(grid,w,boxSet,from,to){
  if(from===to) return 0;
  const dist=new Int32Array(grid.length).fill(-1);
  dist[from]=0;
  const q=[from];
  for(let i=0;i<q.length;i++){
    const c=q[i];
    for(const d of [1,-1,w,-w]){
      const n=c+d;
      if(grid[n]||boxSet.has(n)||dist[n]>=0) continue;
      dist[n]=dist[c]+1;
      if(n===to) return dist[n];
      q.push(n);
    }
  }
  return dist[to];
}

function features(board){
  const p=X.fromXSB(board.split('/'));
  const {grid,w,h,goals}=p;
  const table=E.solvableStates(grid,w,goals,3000000);
  if(!table) return null;
  const reg0=E.regionRep(grid,w,new Set(p.boxes),p.player);
  const k0=E.keyOf(p.boxes.slice().sort((a,b)=>a-b), reg0.rep);
  if(!table.has(k0)) return null;

  const floors=[];
  for(let i=0;i<grid.length;i++) if(!grid[i]) floors.push(i);

  // 最短手順を1本たどって、押し手の合間に歩く距離を数える
  let boxes=p.boxes.slice().sort((a,b)=>a-b);
  let cells=reg0.cells, player=p.player;
  let d=table.get(k0);
  let steps=0, pushes=0;
  const touched=new Set(boxes);
  while(d>0){
    const moves=E.pushesFrom(grid,w,boxes,cells);
    const best=moves.filter(m=>table.get(m.key)===d-1);
    if(!best.length) break;
    const m=best[0];
    // 押すために立つマスは、荷物の反対側
    const dir=m.to-m.box;
    const stand=m.box-dir;
    const boxSet=new Set(boxes);
    const wk=walk(grid,w,boxSet,player,stand);
    steps += (wk>=0?wk:0)+1;                 // 歩いて、1歩押す
    pushes++;
    player=m.box;
    boxes=m.boxes.slice().sort((a,b)=>a-b);
    for(const b of boxes) touched.add(b);
    cells=m.cells;
    d--;
  }

  // 押し手を全部たどって、詰みの割合と局面数を出す
  const seen=new Map([[k0,{boxes:p.boxes.slice().sort((a,b)=>a-b), cells:reg0.cells}]]);
  const q=[k0]; let total=0, dead=0;
  const used=new Set();                       // 荷物が通ったことのあるマス
  while(q.length){
    const k=q.shift(); const s=seen.get(k);
    for(const b of s.boxes) used.add(b);
    for(const m of E.pushesFrom(grid,w,s.boxes,s.cells)){
      total++;
      if(!table.has(m.key)){ dead++; continue; }
      if(seen.has(m.key)) continue;
      seen.set(m.key,{boxes:m.boxes.slice().sort((a,b)=>a-b), cells:m.cells});
      q.push(m.key);
    }
  }

  const W=w-2, H=h-2;
  return {
    W, H, area:W*H, floors:floors.length,
    fill:+(floors.length/(W*H)).toFixed(2),      // 内側のうち床の割合
    boxes:p.boxes.length,
    floorsPerBox:+(floors.length/p.boxes.length).toFixed(1),
    pushes, steps,
    walkPerPush:+(steps/Math.max(1,pushes)).toFixed(1),
    states:seen.size, deadRate:+(dead/Math.max(1,total)).toFixed(2),
    // 荷物がどこにも通らない床の割合(眺めるだけの空き地)
    idle:+(1-used.size/floors.length).toFixed(2),
  };
}

const rows=[];
for(const it of items){
  const f=features(it.b);
  if(!f){ console.log('測れませんでした: 第'+it.at+'面'); continue; }
  rows.push(Object.assign({verdict:it.verdict, at:it.at, sh:it.sh, tr:it.tr, g:it.g, fq:it.f, og:it.og}, f));
}

const good=rows.filter(r=>r.verdict==='good');
const bad =rows.filter(r=>r.verdict==='bad');
console.log(`★ ${good.length}面 / ✕ ${bad.length}面\n`);

const cols=[
  ['内側の広さ','area'],['床マス','floors'],['床の割合','fill'],
  ['荷物','boxes'],['床/荷物','floorsPerBox'],
  ['最短押し手','pushes'],['最短歩数','steps'],['1押しあたり歩数','walkPerPush'],
  ['罠率','tr'],['局面数','states'],['詰む押し手の割合','deadRate'],
  ['荷物が通らない床','idle'],
];
const med=a=>{ if(!a.length) return NaN; const s=a.slice().sort((x,y)=>x-y); return s[s.length>>1]; };
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
console.log('指標'.padEnd(20)+'★の中央値   ✕の中央値    差');
for(const [label,key] of cols){
  const g=med(good.map(r=>r[key])), b=med(bad.map(r=>r[key]));
  const diff = g===0?'-':(((b-g)/Math.abs(g))*100).toFixed(0)+'%';
  console.log(label.padEnd(20)+String(g).padStart(8)+String(b).padStart(12)+String(diff).padStart(9));
}

// 標本が小さいので、指標ごとに「上下に割ったときの✕率」も見る
console.log('\n指標ごとに上下half に割ったときの ✕率');
console.log('指標'.padEnd(20)+'低いほう      高いほう      境目');
for(const [label,key] of cols){
  const vals=rows.map(r=>r[key]).slice().sort((a,b)=>a-b);
  const cut=vals[vals.length>>1];
  const lo=rows.filter(r=>r[key]<cut), hi=rows.filter(r=>r[key]>=cut);
  const rate=a=>a.length?Math.round(a.filter(r=>r.verdict==='bad').length/a.length*100):0;
  const fmt=a=>`${rate(a)}% (${a.filter(r=>r.verdict==='bad').length}/${a.length})`;
  console.log(label.padEnd(20)+fmt(lo).padStart(12)+fmt(hi).padStart(14)+String(cut).padStart(9));
}

console.log('\n面ごと');
console.log('判定 元面  広さ  床  荷物 床/荷 押手 歩数 歩/押 罠率 局面 詰率 遊床  形');
for(const r of rows.sort((a,b)=>a.verdict.localeCompare(b.verdict)||a.at-b.at)){
  console.log(
    (r.verdict==='good'?' ★ ':' ✕ ')
    +String(r.at).padStart(4)+String(r.W+'x'+r.H).padStart(7)
    +String(r.floors).padStart(4)+String(r.boxes).padStart(4)
    +String(r.floorsPerBox).padStart(6)+String(r.pushes).padStart(5)
    +String(r.steps).padStart(5)+String(r.walkPerPush).padStart(6)
    +String(r.tr).padStart(5)+String(r.states).padStart(5)
    +String(r.deadRate).padStart(6)+String(r.idle).padStart(6)
    +'  '+r.sh);
}
