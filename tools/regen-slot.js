'use strict';
/* 指定した面を、同じくらいの手数の新しい面に差し替えるツール。
 *
 *   node tools/regen-slot.js <面番号,...> [levels.json] [seed]
 *
 * 差し替えるものの条件:
 *   - 経路のズレ ≧0.25 と 囮の割合 ≧0.25 (gen-thinky と同じ)
 *   - 最短手数が元の面の ±1 以内 (難易度の並びを崩さない)
 *   - 置き場の並び(モチーフ)が、いまある500面のどれとも被らない
 *   - 盤そのものも当然、既出でない
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {solvableStates, regionRep, greedyPolicies, analyse, mulberry32}=E;
const S=require(path.join(__dirname,'shapes.js'));
const M=require(path.join(__dirname,'manoeuvre.js'));
const DC=require(path.join(__dirname,'decoy.js'));
const MO=require(path.join(__dirname,'motif.js'));
const {toXSB, canonical, hashId}=require(path.join(__dirname,'xsb.js'));

const TARGETS=(process.argv[2]||'').split(',').map(Number).filter(n=>n>=1);
const FILE=process.argv[3]||path.join(__dirname,'..','warehouse','levels.json');
const SEED=+(process.argv[4]||20260811);
if(!TARGETS.length){ console.error('使い方: node tools/regen-slot.js <面番号,...>'); process.exit(1); }

const MIN_MANO=0.25, MIN_DECOY=0.25, MAX_CARRY=10, MAX_FLOORS=36, MAX_PER_BOX=12;

const data=JSON.parse(fs.readFileSync(FILE,'utf8'));
const boards=new Set(data.levels.map(l=>String(canonical(l.b.split('/')))));
const motifs=new Set();
data.levels.forEach((l,i)=>{ if(TARGETS.includes(i+1)) return;   // 差し替える面の分は空ける
  try{ motifs.add(MO.goalMotif(l.b)); }catch(e){} });
const rng=mulberry32(SEED);

function harvest(wantPushes){
  const layout=S.buildShape(rng,{size:['小','中','大'][rng()*3|0]});
  if(!layout||layout.W>9||layout.H>9) return null;
  const {grid,w}=layout;
  const floors=[];
  for(let i=0;i<grid.length;i++) if(!grid[i]) floors.push(i);
  if(floors.length<12||floors.length>MAX_FLOORS) return null;
  const nbox=3+(rng()*2|0);
  if(floors.length/nbox>=MAX_PER_BOX||floors.length<nbox*3) return null;
  const gp=S.pickGoals(layout, floors, nbox, rng);
  if(!gp) return null;
  const goals=gp.goals;
  const dist=solvableStates(grid,w,goals,150000);
  if(!dist) return null;
  const policies=greedyPolicies(grid,w,goals);

  const cands=[];
  for(const [k,d] of dist){
    if(Math.abs(d-wantPushes)>1) continue;
    const boxes=[];
    for(let i=1;i<k.length;i++) boxes.push(k.charCodeAt(i));
    cands.push({boxes, rep:k.charCodeAt(0), d});
  }
  if(!cands.length) return null;

  for(let t=0;t<20;t++){
    const c=cands[rng()*cands.length|0];
    const m=M.manoeuvre(grid, w, c.boxes, goals, c.d);
    if(!m||m.carry>=MAX_CARRY||m.ratio<MIN_MANO) continue;
    const rows=toXSB({grid,w:layout.w,h:layout.h,boxes:c.boxes,goals,player:c.rep});
    const board=rows.join('/');
    if(boards.has(String(canonical(rows)))) continue;
    const mo=MO.goalMotif(board);
    if(motifs.has(mo)) continue;                       // 置き場の並びが既出
    const dc=DC.decoy(board);
    if(!dc||dc.share<MIN_DECOY) continue;
    const r=regionRep(grid,w,new Set(c.boxes),c.rep);
    const a=analyse(grid,w,goals,dist,{boxes:c.boxes,rep:c.rep,cells:r.cells},rng,policies);
    if(!a) continue;
    return {motif:mo, lv:{
      id:hashId(canonical(rows)), b:board, p:a.pushes,
      s:+a.score.toFixed(1), k:+a.score.toFixed(1),
      tr:Math.round(a.trapRatio*100), f:a.forced, g:a.greedyDied, og:a.offGoal?1:0,
      sh:layout.shape, sz:layout.size, ar:layout.W===layout.H?'正方':(layout.W>layout.H?'横長':'縦長'),
      gp:gp.pattern, sp:'-', pl:'-', cl:layout.clutter, st:dist.size,
      carry:m.carry, mano:m.ratio, dec:dc.share, dps:dc.perState,
    }};
  }
  return null;
}

for(const at of TARGETS){
  const old=data.levels[at-1];
  let got=null, tries=0;
  while(!got && tries<200000){ tries++; got=harvest(old.p); }
  if(!got){ console.log(`第${at}面: ${old.p}手の代わりが見つかりませんでした`); continue; }
  got.lv.orig=at;
  data.levels[at-1]=got.lv;
  boards.add(String(canonical(got.lv.b.split('/'))));
  motifs.add(got.motif);
  console.log(`第${at}面  ${old.p}手 → ${got.lv.p}手  (試行${tries}回)`);
  const a=old.b.split('/'), b=got.lv.b.split('/');
  for(let i=0;i<Math.max(a.length,b.length);i++) console.log('   '+(a[i]||'').padEnd(18)+(b[i]||''));
  console.log(`   経路${got.lv.mano} 囮${got.lv.dec} 置き場の並び ${got.motif.replace('/n','  荷物')}\n`);
}

data.count=data.levels.length;
fs.writeFileSync(FILE, JSON.stringify(data));
console.log('書き込みました (全'+data.count+'面)');
