'use strict';
/* 指定したステージを、「まわりより少し大きく、形の変わった」難しい面に差し替えるツール。
 *
 *   node tools/replace-slots.js 6,11,22 [levels.json]
 *
 * 入れる面の条件:
 *   - 内側が 9〜12 マス四方(ふつうの面は 5〜8 なので、ひとまわり大きい)
 *   - 輪郭のはっきりした形(L字・U字・十字・回廊・ドーナツなど)を優先し、
 *     縦横比も偏らせる
 *   - 素直な手筋3種が全滅する
 *   - 一本道が2手以上、または置き場から一度どける必要がある
 * 大きい盤は全状態が増えるので、荷物は2〜3個に抑える。
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {solvableStates, regionRep, greedyPolicies, analyse, mulberry32}=E;
const S=require(path.join(__dirname,'shapes.js'));
const {toXSB, canonical, hashId}=require(path.join(__dirname,'xsb.js'));

const STAGES=(process.argv[2]||'').split(',').map(Number).filter(n=>n>=1);
const TARGET=process.argv[3]||path.join(__dirname,'..','warehouse','levels.json');
if(!STAGES.length){
  console.error('使い方: node tools/replace-slots.js 6,11,22 [levels.json]');
  process.exit(1);
}

// 第5引数 'normal' で、ふつうの大きさの面を作る側に切り替える
const MODE=process.argv[5]==='normal' ? 'normal' : 'odd';
const SEED=20260811;
const STATE_CAP=150000;
const SIZES = MODE==='odd' ? ['特大','超特大'] : ['中','大'];   // 内側 9〜12 / 5〜8
const MIN_SIDE = MODE==='odd' ? 9 : 0;
const MAX_SIDE = MODE==='odd' ? 12 : 8;
const POOL_PER_SLOT=5;
// 広い盤は安全な手も増えるので、罠率のしきいは低めに。第4引数で上げられる
const MIN_TRAP=+(process.argv[4]|| (MODE==='odd'?0.18:0.34));

const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));
for(const s of STAGES){
  if(s>data.levels.length){ console.error(`第${s}面はありません (全${data.levels.length}面)`); process.exit(1); }
}

// まわり(前後5面)の手応えを目標にする
const near=(i,pick)=>{
  const v=[];
  for(let j=Math.max(0,i-5); j<=Math.min(data.levels.length-1,i+5); j++){
    if(j===i) continue;
    v.push(pick(data.levels[j]));
  }
  v.sort((a,b)=>a-b);
  return v.length ? v[v.length>>1] : pick(data.levels[i]);
};
const targets=STAGES.map(s=>({i:s-1, stage:s, push:near(s-1,l=>l.p), trap:near(s-1,l=>l.tr)}));

/* ================= 候補づくり ================= */
const seen=new Set(data.levels.map(l=>canonical(l.b.split('/'))));
const pool=[];
const rng=mulberry32(SEED);
let boards=0;

function harvest(){
  const layout=S.buildShape(rng,{size:SIZES[rng()*SIZES.length|0], extreme:MODE==='odd'&&rng()<0.7});
  if(!layout) return 0;
  if(MIN_SIDE&&layout.W<MIN_SIDE&&layout.H<MIN_SIDE) return 0;   // どちらかは大きいこと
  if(layout.W>MAX_SIDE||layout.H>MAX_SIDE) return 0;
  const {grid,w}=layout;
  const floors=[];
  for(let i=0;i<grid.length;i++) if(!grid[i]) floors.push(i);
  if(MODE==='odd'){ if(floors.length<18||floors.length>95) return 0; }
  else { if(floors.length<12||floors.length>52) return 0; }
  const nbox = floors.length<=45 ? 3+(rng()<0.45?1:0) : floors.length<=70 ? 3 : 2;

  const gp=S.pickGoals(layout, floors, nbox, rng);
  if(!gp) return 0;
  const goals=gp.goals;
  boards++;
  const dist=solvableStates(grid,w,goals,STATE_CAP);
  if(!dist) return 0;
  const policies=greedyPolicies(grid,w,goals);

  // 深い局面ほど厚く採る
  const byDepth=new Map();
  for(const [k,d] of dist){
    if(d<7||d>26) continue;
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
  for(let t=0;t<30 && got<2;t++){
    const bucket=byDepth.get(drawDepth());
    const c=bucket[rng()*bucket.length|0];
    const r=regionRep(grid,w,new Set(c.boxes),c.rep);
    const a=analyse(grid,w,goals,dist,{boxes:c.boxes,rep:c.rep,cells:r.cells},rng,policies);
    if(!a) continue;
    if(a.greedyDied<3) continue;
    if(!(a.forced>=2||a.offGoal)) continue;
    if(a.trapRatio<MIN_TRAP) continue;
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
      // 形の変わった枠だけ印を付ける(ふつうの面には付けない)
      big: MODE==='odd'?1:undefined, bigKind: MODE==='odd'?'odd':undefined,
    });
    got++;
  }
  return got;
}

const want=targets.length*POOL_PER_SLOT;
console.log(`枠 ${targets.length}個 / 候補を ${want}面ぶん作ります`);
const t0=Date.now();
let tries=0, lastLog=0;
while(pool.length<want && tries<want*300){
  tries++;
  harvest();
  if(pool.length>=lastLog+5){
    lastLog=pool.length;
    console.log(`  ${pool.length}面 (盤${boards}枚 / ${((Date.now()-t0)/1000).toFixed(0)}秒)`);
  }
}
console.log(`候補 ${pool.length}面 / 盤 ${boards}枚 / ${((Date.now()-t0)/1000).toFixed(0)}秒\n`);
if(pool.length<targets.length){
  console.error('候補が足りません。条件を緩めてやり直してください。');
  process.exit(1);
}

/* ================= 枠に割り当てる ================= */
const used=new Array(pool.length).fill(false);
let done=0;
for(const t of targets){
  const recent=[];
  for(let j=Math.max(0,t.i-3); j<=Math.min(data.levels.length-1,t.i+3); j++){
    if(j!==t.i) recent.push(data.levels[j]);
  }
  let best=-1, bestCost=Infinity;
  pool.forEach((c,k)=>{
    if(used[k]) return;
    let cost=Math.abs(c.p-t.push)*1.2 + Math.abs(c.tr-t.trap)*0.07;
    for(const r of recent){
      if(r.sh===c.sh) cost+=2.5;
      if(r.ar===c.ar) cost+=0.8;
    }
    if(cost<bestCost){ bestCost=cost; best=k; }
  });
  if(best<0) continue;
  used[best]=true;
  const old=data.levels[t.i], now=pool[best];
  data.levels[t.i]=now;
  const os=old.b.split('/'), ns=now.b.split('/');
  console.log(`第${t.stage}面: ${os[0].length}x${os.length} ${old.p}手 罠${old.tr}%`
    +`  →  ${ns[0].length}x${ns.length} ${now.p}手 罠${now.tr}% 素直に詰む${now.g}/3`
    +` 一本道${now.f} どけ${now.og}  ${now.sh} ${now.ar} ${now.cl}`);
  done++;
}

fs.writeFileSync(TARGET, JSON.stringify(data));
console.log(`\n${TARGET} を更新しました (${done}面を差し替え)`);
