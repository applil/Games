'use strict';
/* 最後に置く「とびきり難しい」面を作って、campaign の末尾に足すツール。
 *
 *   node tools/add-finale.js [levels.json]
 *
 * 20面のうち10面は荷物の数を 4,5,6,7,8 個で2面ずつ。残り10面は数を問わない。
 * どれも次を満たすものだけ採る:
 *   - 素直な手筋3種が全滅する
 *   - 一本道が2手以上、または置き場から一度どける必要がある
 *   - 罠率が高く、手数も長い
 * 並べる順は実測した手応え順。荷物の多い面が本当に難しければ、自然に後ろへ来る。
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {solvableStates, regionRep, greedyPolicies, analyse, mulberry32}=E;
const S=require(path.join(__dirname,'shapes.js'));
const {toXSB, canonical, hashId}=require(path.join(__dirname,'xsb.js'));

const TARGET=process.argv[2]||path.join(__dirname,'..','warehouse','levels.json');
const SEED=+(process.argv[3]||20260813);
const CAP=300000;              // これを超える盤は捨てる(荷物が多いと一気に膨らむ)

// 荷物の数ごとの枠。null は「数を問わない」
const QUOTA=[
  {box:4, n:2}, {box:5, n:2}, {box:6, n:2}, {box:7, n:2}, {box:8, n:2},
  {box:null, n:10},
];
const POOL_X=5;                // 枠数の何倍集めてから選ぶか

const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));
const seen=new Set(data.levels.map(l=>canonical(l.b.split('/'))));
const rng=mulberry32(SEED);

// 荷物の数に対して、床が広すぎると全状態が爆発する
const floorLimit=n => n>=8 ? 45 : n>=7 ? 46 : n>=6 ? 50 : n>=5 ? 55 : 60;

function harvest(nboxWanted){
  const size=['大','特大','超特大'][rng()*3|0];
  const layout=S.buildShape(rng,{size, extreme:rng()<0.35});
  if(!layout) return null;
  if(layout.W>13||layout.H>13) return null;
  const floors=[];
  for(let i=0;i<layout.grid.length;i++) if(!layout.grid[i]) floors.push(i);
  const nbox = nboxWanted || (3+(rng()*3|0));
  if(floors.length<nbox*3||floors.length>floorLimit(nbox)) return null;

  const gp=S.pickGoals(layout, floors, nbox, rng);
  if(!gp) return null;
  const goals=gp.goals;
  const dist=solvableStates(layout.grid, layout.w, goals, CAP);
  if(!dist||dist.size<1500) return null;               // 浅い盤は捨てる

  let deepest=0;
  for(const v of dist.values()) if(v>deepest) deepest=v;
  if(deepest<16) return null;

  const policies=greedyPolicies(layout.grid, layout.w, goals);
  // いちばん深い側だけを見る
  const deep=[];
  for(const [k,d] of dist){
    if(d < deepest-6) continue;
    const rep=k.charCodeAt(0);
    const boxes=[];
    for(let i=1;i<k.length;i++) boxes.push(k.charCodeAt(i));
    deep.push({boxes,rep,d});
  }
  if(!deep.length) return null;

  let best=null;
  for(let t=0;t<40;t++){
    const c=deep[rng()*deep.length|0];
    const r=regionRep(layout.grid, layout.w, new Set(c.boxes), c.rep);
    const a=analyse(layout.grid, layout.w, goals, dist,
                    {boxes:c.boxes, rep:c.rep, cells:r.cells}, rng, policies);
    if(!a) continue;
    if(a.greedyDied<3) continue;
    if(!(a.forced>=2||a.offGoal)) continue;
    if(a.trapRatio<0.30) continue;
    if(a.pushes<16) continue;
    if(!best||a.score>best.a.score) best={c,a};
  }
  if(!best) return null;
  const {c,a}=best;
  const rows=toXSB({grid:layout.grid, w:layout.w, h:layout.h, boxes:c.boxes, goals, player:c.rep});
  const key=canonical(rows);
  if(seen.has(key)) return null;
  seen.add(key);
  return {
    id:hashId(key), b:rows.join('/'), p:a.pushes,
    s:+a.score.toFixed(1), k:+a.score.toFixed(1),
    tr:Math.round(a.trapRatio*100), f:a.forced, g:a.greedyDied, og:a.offGoal?1:0,
    sh:layout.shape, sz:size, ar:layout.W===layout.H?'正方':(layout.W>layout.H?'横長':'縦長'),
    gp:gp.pattern, sp:'-', pl:'-', cl:layout.clutter, st:dist.size,
    big:1, bigKind:'finale', nbox:nbox,
  };
}

/* ================= 集める ================= */
const chosen=[];
const t0=Date.now();
for(const q of QUOTA){
  const label = q.box ? (q.box+'個') : '数は自由';
  const pool=[];
  let tries=0;
  while(pool.length < q.n*POOL_X && tries < q.n*POOL_X*2500){
    tries++;
    const lv=harvest(q.box);
    if(lv) pool.push(lv);
  }
  // 手応えの高い順に採る
  pool.sort((a,b)=>b.s-a.s);
  const take=pool.slice(0, q.n);
  chosen.push(...take);
  console.log(`${label.padEnd(7)} 候補${String(pool.length).padStart(3)}面 → ${take.length}面採用`
    +` / 試行${tries}回 / ${((Date.now()-t0)/1000).toFixed(0)}秒`);
}
if(chosen.length<20){
  console.error(`20面そろいませんでした (${chosen.length}面)`);
}

/* ================= 手応え順に並べて末尾へ ================= */
const diffOf=l => l.p + l.tr*0.10 + (l.g||0)*1.2 + Math.min(l.f||0,4)*0.8 + (l.og?1.2:0);
chosen.sort((a,b)=>diffOf(a)-diffOf(b));

const from=data.levels.length+1;
data.levels.push(...chosen);
data.count=data.levels.length;
fs.writeFileSync(TARGET, JSON.stringify(data));

console.log(`\n第${from}面から ${chosen.length}面を足しました (全${data.count}面)\n`);
console.log('ステージ 荷物  盤     最短  罠率 詰む 一本道 どけ  手応え  形');
chosen.forEach((l,i)=>{
  const r=l.b.split('/');
  console.log(String(from+i).padStart(6), String(l.nbox).padStart(4), (r[0].length+'x'+r.length).padStart(6),
    String(l.p).padStart(5)+'手', String(l.tr).padStart(4)+'%', (l.g+'/3').padStart(4),
    String(l.f).padStart(5), (l.og?' ✓':' －'), diffOf(l).toFixed(1).padStart(7), '  '+l.sh);
});
const last10=chosen.slice(10);
const many=last10.filter(l=>l.nbox>=6).length;
console.log(`\n最後の10面のうち、荷物6個以上は ${many}面`);
