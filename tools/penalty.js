'use strict';
/* 「間違えたとき、どれだけ損をするか」を測る。
 *
 * 囮が多くても、踏んでからすぐ押し戻せるなら、人は迷いながら解けてしまう。
 * 各局面から出せる押し手を、最短手数がどれだけ増えるかで分類する:
 *   0 … 最短のまま(正解)
 *   2 … 1手損。たいてい押し戻せば戻る
 *   4以上 … 取り返しに手間がかかる
 *   詰み … 二度と解けない
 * 「+2で済む手」ばかりの面は、長くても難しくない。
 */
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const X=require(path.join(__dirname,'xsb.js'));

function penalty(board){
  const p=X.fromXSB(board.split('/'));
  const table=E.solvableStates(p.grid,p.w,p.goals,3000000);
  if(!table) return null;
  const reg=E.regionRep(p.grid,p.w,new Set(p.boxes),p.player);
  const k0=E.keyOf(p.boxes.slice().sort((a,b)=>a-b), reg.rep);
  if(!table.has(k0)) return null;
  const seen=new Map([[k0,{boxes:p.boxes.slice().sort((a,b)=>a-b), cells:reg.cells}]]);
  const q=[k0];
  let moves=0, opt=0, dead=0;
  const bucket={2:0, 4:0, 6:0};
  while(q.length){
    const k=q.shift(), s=seen.get(k), d=table.get(k);
    if(d===0) continue;
    for(const m of E.pushesFrom(p.grid,p.w,s.boxes,s.cells)){
      moves++;
      if(!table.has(m.key)){ dead++; continue; }
      const pen=table.get(m.key)-(d-1);
      if(pen<=0) opt++;
      else if(pen<=2) bucket[2]++;
      else if(pen<=4) bucket[4]++;
      else bucket[6]++;
      if(seen.has(m.key)) continue;
      seen.set(m.key,{boxes:m.boxes.slice().sort((a,b)=>a-b), cells:m.cells});
      q.push(m.key);
    }
  }
  const wrong=moves-opt;
  return {
    states:seen.size, moves, opt, dead,
    p2:bucket[2], p4:bucket[4], p6:bucket[6],
    // 間違えた手のうち、1手損で済むものの割合。高いほど「迷っても解ける」
    cheap: wrong? +( bucket[2]/wrong ).toFixed(2) : 0,
    // 間違えた手のうち、取り返しがつかないものの割合
    fatal: wrong? +( dead/wrong ).toFixed(2) : 0,
  };
}
module.exports={penalty};
