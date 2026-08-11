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

// 入口は1つではない。第77面のように経路のズレが0でも、押す順番を間違えると
// ヒヨコが入れなくなる面は面白い(本人の指摘)。型ごとに入口を用意する
const MIN_MANO=0.25;      // 入口A: 運搬でない押し手の割合
const MAX_CARRY=10;       // 運搬の下限
const MAX_FLOORS=36;
const MAX_PER_BOX=12;
const MIN_DECOY=0.25;     // 入口A: 進捗して見える押し手のうち、正解でないもの
// 入口B: 順番。単独だとラベル3面中2面が✕だったので、囮と組ませる
const B_ACCESS=0.43;      // 詰む手のうち、荷物は動かせるのに自機が届かなくなる割合
// 片方だけ突出していれば、もう片方は要らない(ラベル50面中、下の2つはどちらも✕0%)
const C_DECOY=0.40;       // 入口C: 囮だけで十分に強い(第82面の0.53がここ)
const D_MANO=0.55;        // 入口D: 経路のズレだけで十分に強い(第61面の0.55がここ)
const MIN_LATE_R=0.25;    // 終盤の回り込み ÷ 床。✕30% 対 69%
// 歩数そのままでは小さい盤が構造的に通らない(床14マスで10歩は回れない)

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
    const r=regionRep(grid,w,new Set(c.boxes),c.rep);
    const a=analyse(grid,w,goals,dist,{boxes:c.boxes,rep:c.rep,cells:r.cells},rng,policies);
    if(!a) continue;
    const rows=toXSB({grid,w:layout.w,h:layout.h,boxes:c.boxes,goals,player:c.rep});
    const key=canonical(rows);
    if(seen.has(key)) continue;
    const mo=MO.goalMotif(rows.join('/'));
    if(motifs.has(mo)) continue;                 // 置き場の並びが既出
    const dc=DC.decoy(rows.join('/'));
    if(!dc) continue;
    const gdT=goals.map(g=>HV.goalDist(grid,w,g));
    const pf=HV.profile(grid,w,goals,dist,gdT,c.boxes,c.rep,c.rep);
    if(!pf) continue;
    // 共通で外せない2つ(ラベル104面で検証済み)
    if(pf.naive) continue;                               // 素直に解ける面は16面中15面が✕
    if(pf.lateWalk/floors.length<MIN_LATE_R) continue;   // ✕30% 対 69%
    // 型ごとの入口。どちらかを満たせばよい
    const hit=[];
    if(m.ratio>=MIN_MANO && dc.share>=MIN_DECOY) hit.push('思考');
    if(pf.access>=B_ACCESS && dc.share>=MIN_DECOY) hit.push('順番');
    if(dc.share>=C_DECOY) hit.push('囮');
    if(m.ratio>=D_MANO) hit.push('経路');
    if(!hit.length) continue;
    const type=hit.join('+');
    seen.add(key); motifs.add(mo);
    return {
      id:hashId(key), b:rows.join('/'), p:a.pushes,
      s:+a.score.toFixed(1), k:+a.score.toFixed(1),
      tr:Math.round(a.trapRatio*100), f:a.forced, g:a.greedyDied, og:a.offGoal?1:0,
      sh:layout.shape, sz:layout.size, ar:layout.W===layout.H?'正方':(layout.W>layout.H?'横長':'縦長'),
      gp:gp.pattern, sp:'-', pl:'-', cl:layout.clutter, st:dist.size,
      carry:m.carry, mano:m.ratio, dec:dc.share, dps:dc.perState,
      acc:pf.access, lw:pf.lateWalk, lwr:+(pf.lateWalk/floors.length).toFixed(2), type, fresh:1,
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
console.log('\n 面  盤   荷物 最短 運搬 経路 囮  順番 型      形');
got.forEach((l,i)=>{
  const r=l.b.split('/');
  console.log(String(i+1).padStart(3)+((r[0].length-2)+'x'+(r.length-2)).padStart(6)
    +String((l.b.match(/[$*]/g)||[]).length).padStart(4)+String(l.p).padStart(5)
    +String(l.carry).padStart(5)+String(l.mano).padStart(6)+String(l.dec).padStart(5)
    +String(l.acc).padStart(5)+'  '+String(l.type).padEnd(8)+l.sh);
});
