'use strict';
/* 全1000面の「終盤の回り込み ÷ 床」を測る。
 *
 *   node tools/scan-latewalk.js [levels.json]
 *   SHARDS=4 SHARD=0 node tools/scan-latewalk.js      … 4分割で同時に回す
 *
 * ラベル104面で「良い面」の一番強い信号だった(該当の✕率30% 対 非該当69%、39ポイント差)。
 * 最短手順の後半で、次の荷物を押すために大回りさせられるほど「惜しい」面になる。
 *
 * 盤の大きさで割るのが肝。歩数の絶対値で条件にすると、床が14マスの盤で
 * 10歩も回り込めるわけがないので、実質「小さい面を全部落とす」条件になる
 * (moderation/README.md の「指標を盤の大きさで割ること」)。
 *
 * 済んだぶんは tools/stock/latewalk.json に書き足すので、途中で止まっても続きから。
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {minPushes}=require(path.join(__dirname,'astar.js'));

const SHARDS=+(process.env.SHARDS||1), SHARD=+(process.env.SHARD||0);
const NODES=+(process.env.NODES||2e6);       // 親を覚えるぶん重いので、検証より控えめ

const FILE=process.argv[2]||path.join(__dirname,'..','warehouse','levels.json');
const data=JSON.parse(fs.readFileSync(FILE,'utf8'));

const CACHE=path.join(__dirname,'stock','latewalk.json');
let done={};
try{ done=JSON.parse(fs.readFileSync(CACHE,'utf8')); }catch(e){}
function remember(id, v){
  done[id]=v;
  try{
    let cur={};
    try{ cur=JSON.parse(fs.readFileSync(CACHE,'utf8')); }catch(e){}
    cur[id]=v;
    fs.writeFileSync(CACHE+'.'+SHARD, JSON.stringify(cur));
    fs.renameSync(CACHE+'.'+SHARD, CACHE);
    done=cur;
  }catch(e){}
}

function parse(board){
  const rows=board.split('/');
  const h=rows.length, w=Math.max(...rows.map(r=>r.length));
  const grid=new Uint8Array(w*h).fill(1);
  const boxes=[], goals=[];
  let player=-1;
  for(let y=0;y<h;y++){
    const row=rows[y].padEnd(w,'#');
    for(let x=0;x<w;x++){
      const c=row[x], i=y*w+x;
      if(c==='#') continue;
      grid[i]=0;
      if(c==='$'||c==='*') boxes.push(i);
      if(c==='.'||c==='*'||c==='+') goals.push(i);
      if(c==='@'||c==='+') player=i;
    }
  }
  return {grid,w,h,boxes:boxes.sort((a,b)=>a-b),goals:goals.sort((a,b)=>a-b),player};
}

// 荷物を壁として、a から b まで歩く最短歩数。届かなければ -1
function walk(grid, w, boxSet, from, to){
  if(from===to) return 0;
  const d=new Int32Array(grid.length).fill(-1);
  d[from]=0;
  const q=[from];
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

/* 最短手順をたどって、押し手と押し手の間に歩く距離を足す。
   「終盤」は後ろ半分。押した直後に自機は元の荷物の位置にいるので、
   そこから次に押すために立つマスまでの距離が回り込みの量 */
function lateWalk(p){
  const opt={nodes:NODES, path:true};
  const d=minPushes(p.grid, p.w, p.goals, p.boxes, p.player, opt);
  if(d===undefined || d===null || !Array.isArray(opt.path)) return null;
  const seq=opt.path;
  let boxes=p.boxes.slice(), at=p.player, total=0, late=0;
  const half=Math.floor(seq.length/2);
  seq.forEach((m,i)=>{
    const boxSet=new Set(boxes);
    const steps=walk(p.grid, p.w, boxSet, at, m.stand);
    const cost=steps<0?0:steps;
    total+=cost;
    if(i>=half) late+=cost;
    boxes[boxes.indexOf(m.box)]=m.to;
    at=m.box;                                  // 押したあと自機は荷物のいた場所
  });
  return {pushes:d, walk:total, late, floors:p.grid.length-p.grid.reduce((a,b)=>a+b,0)};
}

const t0=Date.now();
let n=0, skipped=0;
data.levels.forEach((lv,i)=>{
  if(i%SHARDS!==SHARD) return;
  if(done[lv.id]!==undefined) return;
  const p=parse(lv.b);
  const r=lateWalk(p);
  if(!r){ remember(lv.id, null); skipped++; return; }
  remember(lv.id, {lw:+(r.late/r.floors).toFixed(3), walk:r.walk, late:r.late, floors:r.floors});
  n++;
  process.stderr.write(`[${SHARD}] 第${i+1}面 ${((Date.now()-t0)/1000).toFixed(0)}秒\n`);
});
console.log(`担当${SHARD}: ${n}面を測定 / ${skipped}面は上限超え (${((Date.now()-t0)/1000).toFixed(1)}秒)`);
