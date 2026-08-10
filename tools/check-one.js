'use strict';
/* 盤面を1つだけ厳密に調べるツール。全面の再検証は重いので、手直しの確認はこちらで。
 *   node tools/check-one.js '<XSB>'  /  node tools/check-one.js --file <json>
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const X=require(path.join(__dirname,'xsb.js'));

// 中身のない壁だけの行・列を落とす(盤が小さく描かれてしまうので)
function trim(board){
  let rows=board.split('/').map(r=>r.split(''));
  const w=Math.max(...rows.map(r=>r.length));
  rows=rows.map(r=>{ while(r.length<w) r.push('#'); return r; });
  const rowHas=y=>rows[y].some(c=>c!=='#');
  const colHas=x=>rows.some(r=>r[x]!=='#');
  let y0=0,y1=rows.length-1,x0=0,x1=w-1;
  while(y0<y1&&!rowHas(y0)) y0++;
  while(y1>y0&&!rowHas(y1)) y1--;
  while(x0<x1&&!colHas(x0)) x0++;
  while(x1>x0&&!colHas(x1)) x1--;
  y0=Math.max(0,y0-1); y1=Math.min(rows.length-1,y1+1);
  x0=Math.max(0,x0-1); x1=Math.min(w-1,x1+1);
  return rows.slice(y0,y1+1).map(r=>r.slice(x0,x1+1).join('')).join('/');
}

function check(board){
  const b=trim(board);
  const p=X.fromXSB(b.split('/'));
  const dist=E.solvableStates(p.grid,p.w,p.goals,3000000);
  if(!dist) return {b, error:'状態が多すぎて調べられません'};
  const reg=E.regionRep(p.grid,p.w,new Set(p.boxes),p.player);
  const k0=E.keyOf(p.boxes.slice().sort((a,b)=>a-b), reg.rep);
  if(!dist.has(k0)) return {b, error:'この配置からは解けません'};
  const a=E.analyse(p.grid,p.w,p.goals,dist,
    {boxes:p.boxes.slice().sort((x,y)=>x-y),rep:reg.rep,cells:reg.cells},
    E.mulberry32(1), E.greedyPolicies(p.grid,p.w,p.goals));
  // 押し手を全部たどって、詰みが何通りあるか数える
  const seen=new Map([[k0,{boxes:p.boxes.slice().sort((x,y)=>x-y), cells:reg.cells, depth:0}]]);
  const q=[k0]; let total=0, dead=0, firstDead=Infinity;
  while(q.length){
    const k=q.shift(); const s=seen.get(k);
    for(const m of E.pushesFrom(p.grid,p.w,s.boxes,s.cells)){
      total++;
      if(!dist.has(m.key)){ dead++; firstDead=Math.min(firstDead,s.depth+1); continue; }
      if(seen.has(m.key)) continue;
      seen.set(m.key,{boxes:m.boxes.slice().sort((x,y)=>x-y), cells:m.cells, depth:s.depth+1});
      q.push(m.key);
    }
  }
  const first=E.pushesFrom(p.grid,p.w,p.boxes.slice().sort((a,b)=>a-b),reg.cells);
  return {b, a, states:seen.size, total, dead, firstDead,
          first:first.length, firstDead1:first.filter(m=>!dist.has(m.key)).length,
          w:p.w-2, h:p.h-2, boxes:p.boxes.length, tableSize:dist.size,
          id:X.hashId(X.canonical(b.split('/')))};
}

let boards=[];
if(process.argv[2]==='--file'){
  const j=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
  boards=(Array.isArray(j)?j:[j]).map(x=>typeof x==='string'?x:x.b);
}else boards=[process.argv[2]];

for(const board of boards){
  const r=check(board);
  console.log(r.b.split('/').join('\n'));
  if(r.error){ console.log('  ' + r.error); continue; }
  console.log(`  ${r.w}x${r.h} 荷物${r.boxes}個 / 最短${r.a.pushes}手 / 罠率${Math.round(r.a.trapRatio*100)}%`
    +` / 素直に詰む${r.a.greedyDied}/3 / 一本道${r.a.forced} / 置き場どけ${r.a.offGoal?'あり':'なし'}`);
  console.log(`  解ける局面 ${r.states}通り / 押し手 ${r.total}通り / 詰む押し手 ${r.dead}通り`
    +(r.dead?`（最短${r.firstDead}手目）`:'')+` / 初手 ${r.first}通り中 詰み${r.firstDead1}通り`);
  console.log(`  id ${r.id}`);
}
