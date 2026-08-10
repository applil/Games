'use strict';
/* とにかく難しい面を量産するツール。
 *
 *   node tools/gen-hard.js [欲しい数] [秒数] [seed] [1盤あたりの採取数]
 *
 * 盤を1枚作るたびに全局面を数え上げ、深い局面をまとめて採る。
 * 数え上げは盤あたり1回、押し距離表は置き場あたり1回で、候補ごとには数え直さない。
 *
 * 条件(モデレーションと第499・500面の分析から):
 *   経路のズレ ≧0.35   まっすぐ運ぶだけでは済まない
 *   囮の割合   ≧0.30   正しそうに見えて違う手がある
 *   強制率     <0.35   最短を保つ手が1本しかない局面ばかりではない
 *                      (第499面0.55・第500面0.48が「長いだけで簡単」だった)
 * 面リストには書き込まない。tools/hard-candidates.json に出すだけ。
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {greedyPolicies, analyse, mulberry32, regionRep}=E;
const S=require(path.join(__dirname,'shapes.js'));
const H=require(path.join(__dirname,'harvest.js'));
const MO=require(path.join(__dirname,'motif.js'));
const {toXSB, canonical, hashId}=require(path.join(__dirname,'xsb.js'));

const WANT=+(process.argv[2]||20);
const SECS=+(process.argv[3]||120);
const SEED=+(process.argv[4]||Date.now()%1e9);
const PER_BOARD=+(process.argv[5]||2);      // 同じ盤からは似た面しか採れないので少しだけ
const OUT=process.argv[6]||path.join(__dirname,'hard-candidates.json');

const MIN_PUSH=28, MIN_MANO=0.35, MIN_DECOY=0.30, MAX_FORCED=0.35;
const CAP=250000;                            // これを超える盤は諦める(粘ると1枚に何分もかかる)

const LV=path.join(__dirname,'..','warehouse','levels.json');
const data=JSON.parse(fs.readFileSync(LV,'utf8'));
const seen=new Set(data.levels.map(l=>String(canonical(l.b.split('/')))));
const motifs=new Set();
for(const l of data.levels){ try{ motifs.add(MO.goalMotif(l.b)); }catch(e){} }
const rng=mulberry32(SEED);

const stat={boards:0, solved:0, capped:0, tooShallow:0, cand:0, mano:0, decoy:0, forced:0, dup:0, got:0};

function harvestBoard(){
  const layout=S.buildShape(rng,{size:['大','特大','超特大'][rng()*3|0]});
  if(!layout) return [];
  stat.boards++;
  const {grid,w}=layout;
  const floors=[];
  for(let i=0;i<grid.length;i++) if(!grid[i]) floors.push(i);
  if(floors.length<24||floors.length>70) return [];
  const nbox=5+(rng()*4|0);
  if(floors.length<nbox*4) return [];
  const gp=S.pickGoals(layout, floors, nbox, rng);
  if(!gp) return [];
  const goals=gp.goals;

  const table=H.solvableStates(grid,w,goals,CAP);
  if(!table){ stat.capped++; return []; }
  stat.solved++;

  // 深い局面を集める。深い順に見て、条件を満たしたものから採る
  const deep=[];
  for(const [k,d] of table) if(d>=MIN_PUSH) deep.push([k,d]);
  if(!deep.length){ stat.tooShallow++; return []; }
  deep.sort((a,b)=>b[1]-a[1]);

  const gd=goals.map(g=>H.goalDist(grid,w,g));
  const policies=greedyPolicies(grid,w,goals);
  const out=[];
  for(const [k,d] of deep){
    if(out.length>=PER_BOARD) break;
    stat.cand++;
    const boxes=[];
    for(let i=1;i<k.length;i++) boxes.push(k.charCodeAt(i));
    const rep=k.charCodeAt(0);
    const carry=H.carryCost(gd, boxes, goals);
    if(carry===null||(d-carry)/d<MIN_MANO){ stat.mano++; continue; }
    const dc=H.decoyFrom(grid,w,goals,table,gd,boxes,rep);
    if(!dc||dc.share<MIN_DECOY){ stat.decoy++; continue; }
    const fs2=H.forcedShare(grid,w,table,boxes,rep);
    if(!fs2||fs2.forced>=MAX_FORCED){ stat.forced++; continue; }
    const rows=toXSB({grid,w:layout.w,h:layout.h,boxes,goals,player:rep});
    const board=rows.join('/');
    const key=String(canonical(rows));
    const mo=MO.goalMotif(board);
    if(seen.has(key)||motifs.has(mo)){ stat.dup++; continue; }
    const r=regionRep(grid,w,new Set(boxes),rep);
    const a=analyse(grid,w,goals,table,{boxes,rep,cells:r.cells},rng,policies);
    if(!a) continue;
    seen.add(key); motifs.add(mo); stat.got++;
    out.push({
      id:hashId(canonical(rows)), b:board, p:d,
      s:+a.score.toFixed(1), k:+a.score.toFixed(1),
      tr:Math.round(a.trapRatio*100), f:a.forced, g:a.greedyDied, og:a.offGoal?1:0,
      sh:layout.shape, sz:layout.size, ar:layout.W===layout.H?'正方':(layout.W>layout.H?'横長':'縦長'),
      gp:gp.pattern, sp:'-', pl:'-', cl:layout.clutter, st:table.size,
      carry, mano:+((d-carry)/d).toFixed(2), dec:dc.share, dps:dc.perState,
      fo:fs2.forced, ops:fs2.optPerState, nbox,
    });
  }
  return out;
}

const found=[];
const t0=Date.now();
while(found.length<WANT && (Date.now()-t0)/1000 < SECS){
  let got=[];
  try{ got=harvestBoard(); }catch(e){}
  for(const lv of got){
    found.push(lv);
    console.log(`  ${lv.p}手 荷物${lv.nbox} 経路${lv.mano} 囮${lv.dec} 強制${lv.fo} `
      +`(${((Date.now()-t0)/1000).toFixed(0)}秒 ${found.length}面目)`);
  }
}
const el=(Date.now()-t0)/1000;
found.sort((a,b)=>b.p-a.p);
console.log(`\n${found.length}面 / ${el.toFixed(0)}秒  = 1面あたり${(el/Math.max(1,found.length)).toFixed(1)}秒`);
console.log(`盤${stat.boards}枚 (数え上げ成功${stat.solved} 上限超え${stat.capped} 浅い${stat.tooShallow})`
  +` / 候補${stat.cand} → 経路落ち${stat.mano} 囮落ち${stat.decoy} 強制落ち${stat.forced} 重複${stat.dup} 合格${stat.got}`);
if(found.length){
  fs.writeFileSync(OUT, JSON.stringify(found,null,1));
  console.log('\n 手数 荷物  盤    経路  囮  強制  形');
  for(const lv of found){
    const r=lv.b.split('/');
    console.log(String(lv.p).padStart(4)+String(lv.nbox).padStart(4)
      +((r[0].length-2)+'x'+(r.length-2)).padStart(8)+String(lv.mano).padStart(6)
      +String(lv.dec).padStart(6)+String(lv.fo).padStart(6)+'  '+lv.sh);
  }
  console.log('\n'+OUT+' に書き出しました');
}
