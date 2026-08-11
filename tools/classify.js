'use strict';
/* 面を「面白さの種類」で分類するための測定。
 *
 * ★を1種類として平均していたせいで、これまでの分析はほとんど空振りしていた。
 * 種類ごとに逆向きの性質があるなら、混ぜれば打ち消し合う。
 * ここでは種類ごとに別々の量を測る。
 *
 *   node tools/classify.js [面番号 or 'all'] [levels.json]
 */
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {solvableStates, regionRep, keyOf, pushesFrom}=E;
const X=require(path.join(__dirname,'xsb.js'));
const H=require(path.join(__dirname,'harvest.js'));

const MAX_PLAUSIBLE=30000;       // 素直な手だけを追う探索の上限

// 盤の連結成分ごとの代表値(荷物を壁とみなす)。自機がどこに居られるかの候補
function regionsOf(grid, w, boxSet){
  const seen=new Uint8Array(grid.length);
  const reps=[];
  for(let i=0;i<grid.length;i++){
    if(grid[i]||seen[i]||boxSet.has(i)) continue;
    const r=regionRep(grid,w,boxSet,i);
    reps.push(r.rep);
    for(const c of r.cells) seen[c]=1;
  }
  return reps;
}

// 自機が from から to まで歩く歩数(荷物は通れない)
function walk(grid, w, boxSet, from, to){
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

function classify(board){
  const p=X.fromXSB(board.split('/'));
  const table=solvableStates(p.grid,p.w,p.goals,3000000);
  if(!table) return null;
  const start=p.boxes.slice().sort((a,b)=>a-b);
  const reg0=regionRep(p.grid,p.w,new Set(start),p.player);
  const k0=keyOf(start, reg0.rep);
  if(!table.has(k0)) return null;
  const D=table.get(k0);
  const gd=p.goals.map(g=>H.goalDist(p.grid,p.w,g));
  const goalIdx=new Map(p.goals.map((g,i)=>[g,i]));

  const near=(c, filled)=>{
    let b=Infinity;
    for(let i=0;i<p.goals.length;i++){ if(filled[i]) continue; const v=gd[i][c]; if(v>=0&&v<b) b=v; }
    return b;
  };
  const filledOf=boxes=>{
    const f=new Array(p.goals.length).fill(false);
    for(const c of boxes){ const gi=goalIdx.get(c); if(gi!==undefined) f[gi]=true; }
    return f;
  };
  // その押し手が「置き場へ近づいて見える」か
  const looksGood=(boxes, from, to)=>{
    const f=filledOf(boxes);
    const fi=goalIdx.get(from);
    const saved = fi!==undefined && f[fi];
    if(saved) f[fi]=false;
    const r = near(to,f) < near(from,f);
    if(saved) f[fi]=true;
    return r;
  };

  /* --- 1) 出だしが見えるか / 5) 非常識な手の数 ---
     最短手順の上で、正解手が「進捗して見える」かどうかを数える */
  let firstLooks=0, firstOpt=0;
  let oddSteps=0, optSteps=0;          // 正解が進捗して見えない場面の数
  /* --- 4) 順番だけの面 ---
     詰む押し手のうち、荷物は動かせるのに自機が届かなくなるものの割合 */
  let deadTotal=0, deadAccess=0;
  /* --- 3) 惜しい面 --- 押すために要る回り込みの歩数 */
  let maxWalk=0, lateWalk=0;

  const info=new Map([[k0,{boxes:start, cells:reg0.cells, player:p.player}]]);
  const q=[k0];
  while(q.length){
    const k=q.shift(), s=info.get(k), d=table.get(k);
    if(d===0) continue;
    const boxSet=new Set(s.boxes);
    let optHere=0, looksHere=0;
    for(const m of pushesFrom(p.grid,p.w,s.boxes,s.cells)){
      const to=m.boxes.find(c=>!s.boxes.includes(c));
      const from=s.boxes.find(c=>!m.boxes.includes(c));
      if(to===undefined||from===undefined) continue;
      const ok = table.has(m.key) && table.get(m.key)===d-1;
      const lg = looksGood(s.boxes, from, to);

      if(!table.has(m.key)){
        deadTotal++;
        // 自機の位置を無視すれば解ける配置か = 順番の問題で詰んだ
        const nb=new Set(m.boxes);
        for(const rep of regionsOf(p.grid,p.w,nb)){
          if(table.has(keyOf(m.boxes.slice().sort((a,b)=>a-b), rep))){ deadAccess++; break; }
        }
      }
      if(!ok) continue;
      optHere++; if(lg) looksHere++;

      // 押すには from の反対側に立つ必要がある。そこまで歩く距離
      const stand=from-(to-from);
      const w2=walk(p.grid,p.w,boxSet,s.player,stand);
      if(w2>maxWalk) maxWalk=w2;
      if(d<=Math.ceil(D/3) && w2>lateWalk) lateWalk=w2;   // 終盤ぶんだけ別に

      if(info.has(m.key)) continue;
      info.set(m.key,{boxes:m.boxes.slice().sort((a,b)=>a-b), cells:m.cells, player:from});
      q.push(m.key);
    }
    optSteps++; if(!looksHere && optHere) oddSteps++;
    if(k===k0){ firstOpt=optHere; firstLooks=looksHere; }
  }

  /* --- 2) 素直に押すだけで解けるか / 騙されてどこまで進めるか ---
     「進捗して見える手」だけを繋いで、どこまで行けるか */
  let plausibleSolves=false, plausibleDepth=0, plausibleDies=0;
  {
    const seen=new Set([k0]);
    const qq=[{boxes:start, cells:reg0.cells, depth:0}];
    let n=0;
    while(qq.length && n<MAX_PLAUSIBLE){
      const s=qq.shift(); n++;
      if(s.depth>plausibleDepth) plausibleDepth=s.depth;
      let advanced=false;
      for(const m of pushesFrom(p.grid,p.w,s.boxes,s.cells)){
        const to=m.boxes.find(c=>!s.boxes.includes(c));
        const from=s.boxes.find(c=>!m.boxes.includes(c));
        if(to===undefined||from===undefined) continue;
        if(!looksGood(s.boxes, from, to)) continue;
        advanced=true;
        if(seen.has(m.key)) continue;
        seen.add(m.key);
        const nb=m.boxes.slice().sort((a,b)=>a-b);
        if(nb.every(c=>goalIdx.has(c))) plausibleSolves=true;
        qq.push({boxes:nb, cells:m.cells, depth:s.depth+1});
      }
      if(!advanced && !plausibleSolves) plausibleDies++;
    }
  }

  return {
    pushes:D, boxes:start.length, states:table.size, optStates:optSteps,
    // 出だしが見えない: 開始局面の正解手のうち、進捗して見えるものの割合
    openness: firstOpt ? +(firstLooks/firstOpt).toFixed(2) : 0,
    // 非常識な手: 正解が「進捗して見えない」場面の割合
    odd: optSteps ? +(oddSteps/optSteps).toFixed(2) : 0,
    // 順番だけ: 詰む押し手のうち、自機が届かなくなるものの割合
    access: deadTotal ? +(deadAccess/deadTotal).toFixed(2) : 0,
    deadTotal,
    // 惜しい: 押すための回り込みの最大歩数(全体 / 終盤)
    walk:maxWalk, lateWalk,
    // 素直に押すだけで解けるか、騙されて何手進めるか
    naive:plausibleSolves, trapDepth:plausibleDepth,
  };
}

module.exports={classify};

if(require.main===module){
  const fs=require('fs');
  const arg=process.argv[2]||'all';
  const TARGET=process.argv[3]||path.join(__dirname,'..','warehouse','levels.json');
  const L=JSON.parse(fs.readFileSync(TARGET,'utf8')).levels;
  const list = arg==='all' ? L.map((l,i)=>i+1) : arg.split(',').map(Number);
  console.log(' 面  手数 荷物 出だし 非常識 順番 回込 終盤 素直 騙され');
  const out=[];
  for(const at of list){
    const l=L[at-1]; if(!l) continue;
    let c=null; try{ c=classify(l.b); }catch(e){}
    if(!c){ console.log(String(at).padStart(4)+'  測れず'); continue; }
    out.push({at, ...c});
    console.log(String(at).padStart(4)+String(c.pushes).padStart(5)+String(c.boxes).padStart(4)
      +String(c.openness).padStart(7)+String(c.odd).padStart(7)+String(c.access).padStart(6)
      +String(c.walk).padStart(5)+String(c.lateWalk).padStart(5)
      +(c.naive?'  解ける':'      -')+String(c.trapDepth).padStart(6));
  }
  if(arg==='all') fs.writeFileSync(path.join(__dirname,'classify.json'), JSON.stringify(out));
}
