'use strict';
/* とにかく難しい面を1つ作るツール。
 *
 *   node tools/gen-hard.js [作る数] [秒数] [seed]
 *
 * ふだんの生成と違って手数の上限を外し、決めた時間だけ回して一番深いものを残す。
 * ただ長いだけの面は作業になるので、モデレーションで効いた2つは必ず満たさせる:
 *   経路のズレ(運搬でない押し手の割合) ≧0.35
 *   囮の割合                        ≧0.30
 * 面リストには書き込まない。出力を見て決める。
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

const WANT=+(process.argv[2]||1);
const SECS=+(process.argv[3]||180);
const SEED=+(process.argv[4]||20260812);

const MIN_MANO=0.35, MIN_DECOY=0.30;
const CAP=1200000;                       // 局面の列挙上限。ここを超える盤は諦める

const LV=path.join(__dirname,'..','warehouse','levels.json');
const data=JSON.parse(fs.readFileSync(LV,'utf8'));
const seen=new Set(data.levels.map(l=>String(canonical(l.b.split('/')))));
const motifs=new Set();
for(const l of data.levels){ try{ motifs.add(MO.goalMotif(l.b)); }catch(e){} }
const rng=mulberry32(SEED);

function harvest(){
  const layout=S.buildShape(rng,{size:['大','特大','超特大'][rng()*3|0]});
  if(!layout) return null;
  const {grid,w}=layout;
  const floors=[];
  for(let i=0;i<grid.length;i++) if(!grid[i]) floors.push(i);
  if(floors.length<24||floors.length>70) return null;
  const nbox=5+(rng()*4|0);                       // 5〜8個
  if(floors.length<nbox*4) return null;

  const gp=S.pickGoals(layout, floors, nbox, rng);
  if(!gp) return null;
  const goals=gp.goals;
  const dist=solvableStates(grid,w,goals,CAP);
  if(!dist) return null;

  // 一番深い局面を上から見る
  let best=null;
  for(const [k,d] of dist){
    if(best && d<=best.d) continue;
    const boxes=[];
    for(let i=1;i<k.length;i++) boxes.push(k.charCodeAt(i));
    best={boxes, rep:k.charCodeAt(0), d};
  }
  if(!best||best.d<25) return null;

  const m=M.manoeuvre(grid, w, best.boxes, goals, best.d);
  if(!m||m.ratio<MIN_MANO) return null;
  const rows=toXSB({grid,w:layout.w,h:layout.h,boxes:best.boxes,goals,player:best.rep});
  const board=rows.join('/');
  if(seen.has(String(canonical(rows)))) return null;
  const mo=MO.goalMotif(board);
  if(motifs.has(mo)) return null;
  const dc=DC.decoy(board);
  if(!dc||dc.share<MIN_DECOY) return null;

  const policies=greedyPolicies(grid,w,goals);
  const r=regionRep(grid,w,new Set(best.boxes),best.rep);
  const a=analyse(grid,w,goals,dist,{boxes:best.boxes,rep:best.rep,cells:r.cells},rng,policies);
  if(!a) return null;
  return {
    id:hashId(canonical(rows)), b:board, p:a.pushes,
    s:+a.score.toFixed(1), k:+a.score.toFixed(1),
    tr:Math.round(a.trapRatio*100), f:a.forced, g:a.greedyDied, og:a.offGoal?1:0,
    sh:layout.shape, sz:layout.size, ar:layout.W===layout.H?'正方':(layout.W>layout.H?'横長':'縦長'),
    gp:gp.pattern, sp:'-', pl:'-', cl:layout.clutter, st:dist.size,
    carry:m.carry, mano:m.ratio, dec:dc.share, dps:dc.perState, nbox,
  };
}

const found=[];
const t0=Date.now();
let tries=0;
while((Date.now()-t0)/1000 < SECS){
  tries++;
  let lv=null;
  try{ lv=harvest(); }catch(e){}
  if(!lv) continue;
  found.push(lv);
  seen.add(String(canonical(lv.b.split('/'))));
  motifs.add(MO.goalMotif(lv.b));
  console.log(`  ${lv.p}手 荷物${lv.nbox} 局面${lv.st} 経路${lv.mano} 囮${lv.dec}  (${((Date.now()-t0)/1000).toFixed(0)}秒)`);
}
found.sort((a,b)=>b.p-a.p);
console.log(`\n試行${tries}回 / ${((Date.now()-t0)/1000).toFixed(0)}秒 / 条件を満たしたもの${found.length}件\n`);
for(const lv of found.slice(0,WANT)){
  const r=lv.b.split('/');
  console.log(`最短${lv.p}手  荷物${lv.nbox}個  盤${(r[0].length-2)}x${(r.length-2)}  局面数${lv.st}`);
  console.log(`経路のズレ${lv.mano}  囮の割合${lv.dec}  運搬下限${lv.carry}手  形:${lv.sh}`);
  console.log(lv.b.split('/').join('\n'));
  console.log('id: '+lv.id);
  console.log('b : '+lv.b+'\n');
}
if(found.length) fs.writeFileSync(path.join(__dirname,'hard-candidates.json'), JSON.stringify(found.slice(0,20),null,1));
