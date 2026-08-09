'use strict';
/* 「広いだけの大きい面」を、小さくて捻りのある面に差し替えるツール。
 *
 *   node tools/replace-big.js [levels.json]
 *
 * 差し替える相手は big:1 かつ bigKind:'plain' の面。
 * 代わりに入れる面の条件:
 *   - 盤が小さい(中〜大の型だけ。外枠こみで 10x10 程度まで)
 *   - 素直な手筋3種が全滅する(greedyDied===3)
 *   - 一本道か、置き場から一度どける必要がある(forced>=2 または offGoal)
 *   - 罠率と手数が、その枠のまわりの面と釣り合っている
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {solvableStates, regionRep, greedyPolicies, analyse, mulberry32, pushesFrom}=E;
const S=require(path.join(__dirname,'shapes.js'));
const {toXSB, canonical, hashId}=require(path.join(__dirname,'xsb.js'));

const TARGET=process.argv[2]||path.join(__dirname,'..','warehouse','levels.json');
const SEED=20260810;
const STATE_CAP=120000;
const SIZES=['中','大'];          // 内側 5〜8。これより大きい型は使わない
const MAX_SIDE=8;                 // 内側の辺の上限
const POOL_PER_SLOT=8;            // 枠1つあたり、これだけ候補を用意してから選ぶ

const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));
const slots=[];
data.levels.forEach((l,i)=>{ if(l.big && l.bigKind==='plain') slots.push(i); });
if(!slots.length){ console.log('差し替える面がありません。'); process.exit(0); }

// その枠のまわり(前後5面)の手応えを目標にする
const near=(i,pick)=>{
  const v=[];
  for(let j=Math.max(0,i-5); j<=Math.min(data.levels.length-1,i+5); j++){
    if(j===i||data.levels[j].big) continue;
    v.push(pick(data.levels[j]));
  }
  v.sort((a,b)=>a-b);
  return v.length ? v[v.length>>1] : pick(data.levels[i]);
};
const targets=slots.map(i=>({i, stage:i+1, push:near(i,l=>l.p), trap:near(i,l=>l.tr)}));

console.log(`差し替える枠 ${slots.length}個`);
for(const t of targets){
  const l=data.levels[t.i];
  const r=l.b.split('/');
  console.log(`  第${t.stage}面 いま ${r[0].length}x${r.length} ${l.p}手 罠${l.tr}%`
    +` → 目標 ${t.push}手 罠${t.trap}%`);
}

/* ================= 候補づくり ================= */
const seen=new Set(data.levels.map(l=>canonical(l.b.split('/'))));
const pool=[];
const rng=mulberry32(SEED);

function harvest(){
  const layout=S.buildShape(rng,{size:SIZES[rng()*SIZES.length|0]});
  if(!layout||layout.W>MAX_SIDE||layout.H>MAX_SIDE) return 0;
  const {grid,w}=layout;
  const floors=[];
  for(let i=0;i<grid.length;i++) if(!grid[i]) floors.push(i);
  if(floors.length<12||floors.length>52) return 0;
  const nbox=3+(rng()<0.45?1:0);
  if(floors.length<nbox*3+2) return 0;

  const gp=S.pickGoals(layout, floors, nbox, rng);
  if(!gp) return 0;
  const goals=gp.goals;
  const dist=solvableStates(grid,w,goals,STATE_CAP);
  if(!dist) return 0;
  const policies=greedyPolicies(grid,w,goals);

  // 手数の深い局面ほど厚く採る(浅い局面は数が多く、そればかりになるため)
  const byDepth=new Map();
  for(const [k,d] of dist){
    if(d<6||d>24) continue;
    const rep=k.charCodeAt(0);
    const boxes=[];
    for(let i=1;i<k.length;i++) boxes.push(k.charCodeAt(i));
    if(!byDepth.has(d)) byDepth.set(d,[]);
    byDepth.get(d).push({boxes,rep,d});
  }
  if(!byDepth.size) return 0;
  const depths=[...byDepth.keys()];
  const weights=depths.map(d=>Math.pow(d,2.2));
  const wsum=weights.reduce((a,b)=>a+b,0);
  const drawDepth=()=>{
    let r=rng()*wsum;
    for(let i=0;i<depths.length;i++){ r-=weights[i]; if(r<0) return depths[i]; }
    return depths[depths.length-1];
  };

  let got=0;
  for(let t=0;t<24 && got<2;t++){
    const bucket=byDepth.get(drawDepth());
    const c=bucket[rng()*bucket.length|0];
    const r=regionRep(grid,w,new Set(c.boxes),c.rep);
    const a=analyse(grid,w,goals,dist,{boxes:c.boxes,rep:c.rep,cells:r.cells},rng,policies);
    if(!a) continue;
    if(a.greedyDied<3) continue;                    // 素直な手筋が生き残る面は捨てる
    if(!(a.forced>=2||a.offGoal)) continue;         // 一本道でも置き場どけでもない面も捨てる
    if(a.trapRatio<0.22) continue;
    const rows=toXSB({grid,w:layout.w,h:layout.h,boxes:c.boxes,goals,player:c.rep});
    const key=canonical(rows);
    if(seen.has(key)) continue;
    seen.add(key);
    pool.push({
      id:hashId(key), b:rows.join('/'), p:a.pushes,
      s:+a.score.toFixed(1), k:+a.score.toFixed(1),
      tr:Math.round(a.trapRatio*100), f:a.forced, g:a.greedyDied, og:a.offGoal?1:0,
      sh:layout.shape, sz:layout.size, ar:layout.aspect, gp:gp.pattern,
      sp:'-', pl:'-', cl:layout.clutter, st:dist.size,
    });
    got++;
  }
  return got;
}

const want=slots.length*POOL_PER_SLOT;
const t0=Date.now();
let tries=0;
while(pool.length<want && tries<want*400){ tries++; harvest(); }
console.log(`\n候補 ${pool.length}面 / 試行 ${tries}回 / ${((Date.now()-t0)/1000).toFixed(0)}秒`);
if(pool.length<slots.length){
  console.error('候補が足りません。条件を緩めてやり直してください。');
  process.exit(1);
}

/* ================= 枠に割り当てる ================= */
const used=new Array(pool.length).fill(false);
let done=0;
for(const t of targets){
  // 前後3面と形がかぶらないように軽い罰を付ける
  const recent=[];
  for(let j=Math.max(0,t.i-3); j<=Math.min(data.levels.length-1,t.i+3); j++){
    if(j!==t.i) recent.push(data.levels[j]);
  }
  let best=-1, bestCost=Infinity;
  pool.forEach((c,k)=>{
    if(used[k]) return;
    let cost=Math.abs(c.p-t.push)*1.6 + Math.abs(c.tr-t.trap)*0.09;
    for(const r of recent){
      if(r.sh===c.sh) cost+=2.5;
      if(r.gp===c.gp) cost+=1.2;
    }
    if(cost<bestCost){ bestCost=cost; best=k; }
  });
  if(best<0) continue;
  used[best]=true;
  const old=data.levels[t.i], now=pool[best];
  data.levels[t.i]=now;
  const os=old.b.split('/'), ns=now.b.split('/');
  console.log(`第${t.stage}面: ${os[0].length}x${os.length} ${old.p}手 罠${old.tr}% 素直に詰む${old.g}/3`
    +`  →  ${ns[0].length}x${ns.length} ${now.p}手 罠${now.tr}% 素直に詰む${now.g}/3`
    +` 一本道${now.f} どけ${now.og}  ${now.sh}`);
  done++;
}

fs.writeFileSync(TARGET, JSON.stringify(data));
console.log(`\n${TARGET} を更新しました (${done}面を差し替え)`);
