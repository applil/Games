'use strict';
/* 1枚の盤から、難しい面をまとめて採るための共通処理。
 *
 * これまでは候補1つごとに solvableStates を呼び直していた。
 * 盤と置き場が同じなら結果も同じなので、盤あたり1回にまとめる。
 *   - 全局面表          … 盤ごとに1回
 *   - 置き場までの押し距離 … 置き場ごとに1回
 * 候補ごとにやるのは、最短手順の枝をたどる分だけ。
 * これで「1回数え上げて1面」から「1回数え上げて何十面」に変わる。
 */
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {solvableStates, regionRep, keyOf, pushesFrom}=E;

// ある置き場まで、荷物をまっすぐ押していくのに要る手数を全マスぶん出す(置き場から逆にたどる)
function goalDist(grid, w, goal){
  const d=new Int32Array(grid.length).fill(-1);
  d[goal]=0;
  const q=[goal];
  for(let i=0;i<q.length;i++){
    const c=q[i];
    for(const dd of [1,-1,w,-w]){
      const from=c-dd;                       // from を dd 方向へ押すと c に来る
      if(grid[from]||d[from]>=0) continue;
      if(grid[from-dd]) continue;            // 押す側に立てない
      d[from]=d[c]+1; q.push(from);
    }
  }
  return d;
}

// 荷物を割り当てて、まっすぐ押すだけなら何手か。
// 全通り試すと荷物8個で40320通りになる。ビットで持てば256×8回で済む
// (どの置き場を使い終えたかだけ覚えていればよく、順番は関係ない)
function carryCost(gd, boxes, goals){
  const n=boxes.length, full=(1<<n)-1;
  const INF=Infinity;
  const dp=new Float64Array(full+1).fill(INF);
  dp[0]=0;
  const used=new Int32Array(full+1);
  for(let m=0;m<=full;m++){
    if(dp[m]===INF) continue;
    let i=0, mm=m; while(mm){ i+=mm&1; mm>>=1; }   // 何個決まったか = 次に決める荷物の番号
    if(i>=n) continue;
    const b=boxes[i];
    for(let j=0;j<n;j++){
      if(m&(1<<j)) continue;
      const v=gd[j][b];
      if(v<0) continue;
      const nm=m|(1<<j);
      if(dp[m]+v<dp[nm]) dp[nm]=dp[m]+v;
    }
  }
  return dp[full]===INF ? null : dp[full];
}

// 囮の数え上げ。全局面表と押し距離表を渡すので、ここでは数え直さない
function decoyFrom(grid, w, goals, table, gd, boxes0, rep0){
  const start=boxes0.slice().sort((a,b)=>a-b);
  const reg=regionRep(grid,w,new Set(start),rep0);
  const k0=keyOf(start, reg.rep);
  if(!table.has(k0)) return null;
  const goalIdx=new Map(goals.map((g,i)=>[g,i]));
  const near=(c, filled)=>{
    let b=Infinity;
    for(let i=0;i<goals.length;i++){ if(filled[i]) continue; const v=gd[i][c]; if(v>=0&&v<b) b=v; }
    return b;
  };
  const seen=new Map([[k0,{boxes:start, cells:reg.cells}]]);
  const q=[k0];
  let states=0, looks=0, decoys=0, corrects=0, lethal=0;
  while(q.length){
    const k=q.shift(), s=seen.get(k), d=table.get(k);
    if(d===0) continue;
    states++;
    const filled=new Array(goals.length).fill(false);
    for(const c of s.boxes){ const gi=goalIdx.get(c); if(gi!==undefined) filled[gi]=true; }
    for(const m of pushesFrom(grid,w,s.boxes,s.cells)){
      const moved=m.boxes.find(c=>!s.boxes.includes(c));
      const from =s.boxes.find(c=>!m.boxes.includes(c));
      if(moved===undefined||from===undefined) continue;
      const fi=goalIdx.get(from);
      const saved = fi!==undefined && filled[fi];
      if(saved) filled[fi]=false;
      const looksGood = near(moved,filled) < near(from,filled);
      if(saved) filled[fi]=true;
      const ok = table.has(m.key) && table.get(m.key)===d-1;
      if(looksGood) looks++;
      if(ok) corrects++;
      if(looksGood&&!ok){ decoys++; if(!table.has(m.key)) lethal++; }
      if(!ok||seen.has(m.key)) continue;
      seen.set(m.key,{boxes:m.boxes.slice().sort((a,b)=>a-b), cells:m.cells});
      q.push(m.key);
    }
  }
  return {states, looks, corrects, decoys, lethal,
    share: looks? +(decoys/looks).toFixed(2) : 0,
    perState: states? +(decoys/states).toFixed(2) : 0,
    // 最短を保つ手が1本しかない局面の割合。高いほど一本道で、長くても簡単
    forced: states? +(1 - (corrects-states)/Math.max(1,states)).toFixed(2) : 1};
}

// 最短経路上で「指す手が1本しかない」局面の割合。第499・500面が簡単だった理由がこれ
function forcedShare(grid, w, table, boxes0, rep0){
  const start=boxes0.slice().sort((a,b)=>a-b);
  const reg=regionRep(grid,w,new Set(start),rep0);
  const k0=keyOf(start, reg.rep);
  if(!table.has(k0)) return null;
  const seen=new Map([[k0,{boxes:start, cells:reg.cells}]]);
  const q=[k0]; let n=0, only=0, opts=0;
  while(q.length){
    const k=q.shift(), s=seen.get(k), d=table.get(k);
    if(d===0) continue;
    let o=0;
    for(const m of pushesFrom(grid,w,s.boxes,s.cells)){
      if(!table.has(m.key)||table.get(m.key)!==d-1) continue;
      o++;
      if(seen.has(m.key)) continue;
      seen.set(m.key,{boxes:m.boxes.slice().sort((a,b)=>a-b), cells:m.cells});
      q.push(m.key);
    }
    n++; opts+=o; if(o===1) only++;
  }
  return {pathStates:n, optPerState:+(opts/n).toFixed(2), forced:+(only/n).toFixed(2)};
}


/* 種類を測る。全局面表と押し距離表を渡すので、ここでは数え直さない。
 *   naive  … 置き場に近づいて見える押し手だけを繋いで、解けてしまうか(94%が✕だった型)
 *   access … 詰む押し手のうち、荷物は動かせるのに自機が届かなくなる割合(「順番だけ」の型)
 *   late   … 最短手順の終盤で、押すために回り込む歩数(「惜しい」の型。27%対58%で最良)
 */
function regionsOf(grid, w, boxSet){
  const seen=new Uint8Array(grid.length), reps=[];
  for(let i=0;i<grid.length;i++){
    if(grid[i]||seen[i]||boxSet.has(i)) continue;
    const r=regionRep(grid,w,boxSet,i);
    reps.push(r.rep);
    for(const c of r.cells) seen[c]=1;
  }
  return reps;
}
function walkSteps(grid, w, boxSet, from, to){
  if(from===to) return 0;
  const d=new Int32Array(grid.length).fill(-1);
  d[from]=0; const q=[from];
  for(let i=0;i<q.length;i++){
    const c=q[i];
    for(const dd of [1,-1,w,-w]){
      const n=c+dd;
      if(grid[n]||boxSet.has(n)||d[n]>=0) continue;
      d[n]=d[c]+1;
      if(n===to) return d[n];
      q.push(n);
    }
  }
  return -1;
}
function profile(grid, w, goals, table, gd, boxes0, rep0, player0){
  const start=boxes0.slice().sort((a,b)=>a-b);
  const reg=regionRep(grid,w,new Set(start),rep0);
  const k0=keyOf(start, reg.rep);
  if(!table.has(k0)) return null;
  const D=table.get(k0);
  const goalIdx=new Map(goals.map((g,i)=>[g,i]));
  const near=(c, filled)=>{
    let b=Infinity;
    for(let i=0;i<goals.length;i++){ if(filled[i]) continue; const v=gd[i][c]; if(v>=0&&v<b) b=v; }
    return b;
  };
  const looksGood=(bx, from, to)=>{
    const f=new Array(goals.length).fill(false);
    for(const c of bx){ const gi=goalIdx.get(c); if(gi!==undefined) f[gi]=true; }
    const fi=goalIdx.get(from);
    const saved = fi!==undefined && f[fi];
    if(saved) f[fi]=false;
    const r = near(to,f) < near(from,f);
    if(saved) f[fi]=true;
    return r;
  };

  let deadTotal=0, deadAccess=0, maxWalk=0, lateWalk=0;
  const info=new Map([[k0,{boxes:start, cells:reg.cells, player:(player0===undefined?rep0:player0)}]]);
  const q=[k0];
  while(q.length){
    const k=q.shift(), s=info.get(k), d=table.get(k);
    if(d===0) continue;
    const boxSet=new Set(s.boxes);
    for(const m of pushesFrom(grid,w,s.boxes,s.cells)){
      const to=m.boxes.find(c=>!s.boxes.includes(c));
      const from=s.boxes.find(c=>!m.boxes.includes(c));
      if(to===undefined||from===undefined) continue;
      if(!table.has(m.key)){
        deadTotal++;
        const nb=new Set(m.boxes);
        for(const rp of regionsOf(grid,w,nb)){
          if(table.has(keyOf(m.boxes.slice().sort((a,b)=>a-b), rp))){ deadAccess++; break; }
        }
        continue;
      }
      if(table.get(m.key)!==d-1) continue;
      const stand=from-(to-from);
      const ws=walkSteps(grid,w,boxSet,s.player,stand);
      if(ws>maxWalk) maxWalk=ws;
      if(d<=Math.ceil(D/3) && ws>lateWalk) lateWalk=ws;
      if(info.has(m.key)) continue;
      info.set(m.key,{boxes:m.boxes.slice().sort((a,b)=>a-b), cells:m.cells, player:from});
      q.push(m.key);
    }
  }

  // 素直な手だけで解けてしまうか
  let naive=false;
  {
    const seen=new Set([k0]);
    const qq=[{boxes:start, cells:reg.cells}];
    let n=0;
    while(qq.length && n<20000 && !naive){
      const s=qq.shift(); n++;
      for(const m of pushesFrom(grid,w,s.boxes,s.cells)){
        const to=m.boxes.find(c=>!s.boxes.includes(c));
        const from=s.boxes.find(c=>!m.boxes.includes(c));
        if(to===undefined||from===undefined) continue;
        if(!looksGood(s.boxes, from, to)) continue;
        if(seen.has(m.key)) continue;
        seen.add(m.key);
        const nb=m.boxes.slice().sort((a,b)=>a-b);
        if(nb.every(c=>goalIdx.has(c))){ naive=true; break; }
        qq.push({boxes:nb, cells:m.cells});
      }
    }
  }
  return {naive, access: deadTotal? +(deadAccess/deadTotal).toFixed(2) : 0,
          walk:maxWalk, lateWalk};
}

module.exports={goalDist, carryCost, decoyFrom, forcedShare, profile, solvableStates};
