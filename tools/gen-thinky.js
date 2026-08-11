'use strict';
/* モデレーション90面から出た条件で面を作るツール。
 *
 *   node tools/gen-thinky.js [作る数] [levels.json]
 *
 * 90面のラベルで効いていたのは、難しさではなく「作業か思考か」だった。
 * 90面と45面の2回で確かめた条件。効くのは2つ:
 *   - 経路のズレ(運搬でない押し手の割合) ≧ 0.25 … 26% / 69%
 *   - 囮の割合                        ≧ 0.25 … 24% / 62%
 * この2つは独立に効く。順番のズレは経路の言い換え、行き先のズレは無関係だった。
 *
 * 必須にするのはこの4つ:
 *   - 運搬でない押し手の割合 ≧ 0.25  (最短手順のうち、置き場へ近づける以外に使う手)
 *   - 運搬の下限 < 10               (押して運ぶ距離そのものは短く)
 *   - 荷物3個以上                   (荷物どうしが干渉する)
 *   - 床/荷物 < 12、床 < 36          (盤に対して荷物が薄くない)
 * 逆に、罠率・素直な手筋・一本道・置き場どけは条件から外す。
 * 90面では ★✕ とまったく相関しなかった。
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {solvableStates, regionRep, greedyPolicies, analyse, mulberry32, keyOf, pushesFrom}=E;
const S=require(path.join(__dirname,'shapes.js'));
const M=require(path.join(__dirname,'manoeuvre.js'));
const HV=require(path.join(__dirname,'harvest.js'));
const DC=require(path.join(__dirname,'decoy.js'));
const MO=require(path.join(__dirname,'motif.js'));
const {toXSB, canonical, hashId}=require(path.join(__dirname,'xsb.js'));

const WANT=+(process.argv[2]||45);
const TARGET=process.argv[3]||path.join(__dirname,'..','warehouse','levels.json');
const SEED=+(process.argv[4]||20260815);

const MIN_MANO=0.25;      // 運搬でない押し手の割合
const MAX_CARRY=10;       // 運搬の下限
const MAX_FLOORS=36;
const MAX_PER_BOX=12;
const MIN_DECOY=0.25;     // 進捗して見える押し手のうち、正解でないものの割合
const MIN_LATE=10;        // 終盤に要る回り込みの歩数(「惜しい」型。✕37% 対 55%)

const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));
const seen=new Set(data.levels.map(l=>canonical(l.b.split('/'))));
// 置き場の並びが同じ面は、壁の飾りが違っても遊ぶ人には同じ問題に見える
const motifs=new Set();
for(const l of data.levels){ try{ motifs.add(MO.goalMotif(l.b)); }catch(e){} }
const rng=mulberry32(SEED);

function harvest(){
  const layout=S.buildShape(rng,{size:['小','中','大'][rng()*3|0]});
  if(!layout||layout.W>9||layout.H>9) return null;
  const {grid,w}=layout;
  const floors=[];
  for(let i=0;i<grid.length;i++) if(!grid[i]) floors.push(i);
  if(floors.length<12||floors.length>MAX_FLOORS) return null;
  const nbox=3+(rng()*2|0);                       // 3〜4個
  if(floors.length/nbox>=MAX_PER_BOX) return null;
  if(floors.length<nbox*3) return null;

  const gp=S.pickGoals(layout, floors, nbox, rng);
  if(!gp) return null;
  const goals=gp.goals;
  const dist=solvableStates(grid,w,goals,150000);
  if(!dist) return null;
  const policies=greedyPolicies(grid,w,goals);

  const cands=[];
  for(const [k,d] of dist){
    if(d<6||d>26) continue;
    const rep=k.charCodeAt(0);
    const boxes=[];
    for(let i=1;i<k.length;i++) boxes.push(k.charCodeAt(i));
    cands.push({boxes,rep,d});
  }
  if(!cands.length) return null;

  for(let t=0;t<30;t++){
    const c=cands[rng()*cands.length|0];
    const m=M.manoeuvre(grid, w, c.boxes, goals, c.d);
    if(!m) continue;
    if(m.carry>=MAX_CARRY) continue;
    if(m.ratio<MIN_MANO) continue;               // ここが肝
    const r=regionRep(grid,w,new Set(c.boxes),c.rep);
    const a=analyse(grid,w,goals,dist,{boxes:c.boxes,rep:c.rep,cells:r.cells},rng,policies);
    if(!a) continue;
    const rows=toXSB({grid,w:layout.w,h:layout.h,boxes:c.boxes,goals,player:c.rep});
    const key=canonical(rows);
    if(seen.has(key)) continue;
    const mo=MO.goalMotif(rows.join('/'));
    if(motifs.has(mo)) continue;                 // 置き場の並びが既出
    const dc=DC.decoy(rows.join('/'));           // 囮がない盤は、見た目どおり押すだけで解ける
    if(!dc||dc.share<MIN_DECOY) continue;
    // 進捗して見える手だけで解けてしまう面は、ラベル16面中15面が✕だった。必ず弾く
    const gdT=goals.map(g=>HV.goalDist(grid,w,g));
    const pf=HV.profile(grid,w,goals,dist,gdT,c.boxes,c.rep,c.rep);
    if(!pf||pf.naive) continue;
    if(pf.lateWalk<MIN_LATE) continue;
    seen.add(key); motifs.add(mo);
    return {
      id:hashId(key), b:rows.join('/'), p:a.pushes,
      s:+a.score.toFixed(1), k:+a.score.toFixed(1),
      tr:Math.round(a.trapRatio*100), f:a.forced, g:a.greedyDied, og:a.offGoal?1:0,
      sh:layout.shape, sz:layout.size, ar:layout.W===layout.H?'正方':(layout.W>layout.H?'横長':'縦長'),
      gp:gp.pattern, sp:'-', pl:'-', cl:layout.clutter, st:dist.size,
      carry:m.carry, mano:m.ratio, dec:dc.share, dps:dc.perState,
      acc:pf.access, lw:pf.lateWalk, fresh:1,
    };
  }
  return null;
}

const got=[];
const t0=Date.now();
let tries=0;
while(got.length<WANT && tries<WANT*4000){
  tries++;
  const lv=harvest();
  if(lv) got.push(lv);
  if(got.length && got.length%10===0 && got.length!==(got._last||0)){
    got._last=got.length;
    console.log(`  ${got.length}面 (試行${tries}回 / ${((Date.now()-t0)/1000).toFixed(0)}秒)`);
  }
}
console.log(`\n${got.length}面できました (試行${tries}回 / ${((Date.now()-t0)/1000).toFixed(0)}秒)\n`);

// やさしい順に並べてから先頭へ置く
got.sort((a,b)=>a.p-b.p||a.tr-b.tr);
data.levels.forEach((l,i)=>{ if(l.orig===undefined) l.orig=i+1; });
got.forEach((l,i)=>{ l.orig=1000+i; });          // 並びを戻すとき、既存の後ろに来るように
data.levels=got.concat(data.levels);
data.count=data.levels.length;
data.reordered={from:1, at:'fresh-first'};
fs.writeFileSync(TARGET, JSON.stringify(data));

const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
console.log(`第1〜${got.length}面に置きました (全${data.count}面)`);
console.log(`  平均 最短${mean(got.map(l=>l.p)).toFixed(1)}手 / 運搬下限${mean(got.map(l=>l.carry)).toFixed(1)}手`
  +` / 運搬でない割合${mean(got.map(l=>l.mano)).toFixed(2)} / 囮の割合${mean(got.map(l=>l.dec)).toFixed(2)}`);
console.log('\n 面  盤   荷物 最短 運搬 経路 囮   罠率  形');
got.forEach((l,i)=>{
  const r=l.b.split('/');
  console.log(String(i+1).padStart(3)+((r[0].length-2)+'x'+(r.length-2)).padStart(6)
    +String((l.b.match(/[$*]/g)||[]).length).padStart(4)+String(l.p).padStart(5)
    +String(l.carry).padStart(5)+String(l.mano).padStart(6)+String(l.dec).padStart(5)+String(l.tr).padStart(6)+'  '+l.sh);
});
