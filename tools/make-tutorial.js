'use strict';
/* チュートリアル用の面を作って、指定のステージと差し替えるツール。
 *
 *   node tools/make-tutorial.js <ステージ> <荷物の数> [形,形,...] [levels.json]
 *
 * チュートリアルの条件はひとつ: どう押しても詰まないこと。
 *   罠率0% / 素直な手筋が1つも死なない / 一本道なし / 置き場からどける必要なし
 * 形を指定すると、その型の中からだけ選ぶ(いまの面と見た目を変えたいとき)。
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {solvableStates, regionRep, greedyPolicies, analyse, mulberry32}=E;
const S=require(path.join(__dirname,'shapes.js'));
const {toXSB, canonical, hashId}=require(path.join(__dirname,'xsb.js'));

const STAGE=+process.argv[2];
const NBOX=+process.argv[3];
const SHAPES=(process.argv[4]||'').split(',').filter(Boolean);
const TARGET=process.argv[5]||path.join(__dirname,'..','warehouse','levels.json');
if(!(STAGE>=1)||!(NBOX>=1)){
  console.error('使い方: node tools/make-tutorial.js <ステージ> <荷物の数> [形,...] [levels.json]');
  process.exit(1);
}

const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));
const old=data.levels[STAGE-1];
if(!old){ console.error(`第${STAGE}面がありません`); process.exit(1); }

const seen=new Set(data.levels.map(l=>canonical(l.b.split('/'))));
const rng=mulberry32(20260814);

function harvest(){
  const opts={size: ['小','中'][rng()<0.6?0:1]};
  // 乱数は find の外で引くこと。中で引くと要素ごとに別の名前と比べてしまう
  const want = SHAPES.length ? SHAPES[rng()*SHAPES.length|0] : null;
  const sh = want ? S.SHAPES.find(x=>x.name===want) : null;
  let layout;
  if(sh){
    const {W,H}=S.pickSize(rng, sh.min[0], sh.min[1], opts.size);
    const L=sh.build(rng,W,H);
    L.shape=sh.name;
    if(!S.keepLargest(L)) return null;
    layout=S.crop(L);
    if(layout) layout.clutter='がらんどう';
  }else{
    layout=S.buildShape(rng,opts);
  }
  if(!layout||layout.W>6||layout.H>6) return null;
  const {grid,w}=layout;
  const floors=[];
  for(let i=0;i<grid.length;i++) if(!grid[i]) floors.push(i);
  if(floors.length<NBOX*2+2||floors.length>26) return null;

  const gp=S.pickGoals(layout, floors, NBOX, rng);
  if(!gp) return null;
  const goals=gp.goals;
  const dist=solvableStates(grid,w,goals,80000);
  if(!dist) return null;
  const policies=greedyPolicies(grid,w,goals);
  for(const [k,d] of dist){
    if(d<NBOX||d>NBOX+2) continue;                 // 荷物1つにつき1〜2手
    const rep=k.charCodeAt(0);
    const boxes=[];
    for(let i=1;i<k.length;i++) boxes.push(k.charCodeAt(i));
    const r=regionRep(grid,w,new Set(boxes),rep);
    const a=analyse(grid,w,goals,dist,{boxes,rep,cells:r.cells},rng,policies);
    if(!a) continue;
    // ここが肝。どう押しても詰まない面だけを通す
    if(a.trapRatio>0||a.greedyDied>0||a.forced>0||a.offGoal) continue;
    // チュートリアルは「運ぶ」を教える面なので、最初から置き場に乗った荷物は避ける
    if(boxes.some(b=>goals.indexOf(b)>=0)) continue;
    const rows=toXSB({grid,w:layout.w,h:layout.h,boxes,goals,player:rep});
    const key=canonical(rows);
    if(seen.has(key)) continue;
    return {
      id:hashId(key), b:rows.join('/'), p:a.pushes,
      s:+a.score.toFixed(1), k:+a.score.toFixed(1),
      tr:Math.round(a.trapRatio*100), f:a.forced, g:a.greedyDied, og:a.offGoal?1:0,
      sh:layout.shape, sz:layout.size||'小', ar:layout.W===layout.H?'正方':(layout.W>layout.H?'横長':'縦長'),
      gp:gp.pattern, sp:'-', pl:'-', cl:layout.clutter||'がらんどう', st:dist.size, tut:NBOX,
      _W:layout.W, _H:layout.H,
    };
  }
  return null;
}

// いまの面と見た目が近いものは避けたいので、いくつか作って一番違うものを採る
const pool=[];
let tries=0;
while(pool.length<40 && tries<40000){ tries++; const lv=harvest(); if(lv) pool.push(lv); }
if(!pool.length){ console.error('作れませんでした。条件を緩めてください。'); process.exit(1); }

const oldRows=old.b.split('/');
const oldW=oldRows[0].length-2, oldH=oldRows.length-2;
const oldWallRatio=(old.b.match(/#/g)||[]).length/old.b.replace(/\//g,'').length;
// 形の型・縦横比・壁の多さ・大きさ、全部が今と違うほど高い点
const score=l=>{
  const wallRatio=(l.b.match(/#/g)||[]).length/l.b.replace(/\//g,'').length;
  return (l.sh!==old.sh ? 3 : 0)
       + Math.min(3, Math.abs(l._W-oldW)+Math.abs(l._H-oldH))
       + Math.abs(wallRatio-oldWallRatio)*6
       + (l.ar!==(oldW===oldH?'正方':(oldW>oldH?'横長':'縦長')) ? 2 : 0);
};
pool.sort((a,b)=>score(b)-score(a));
const now=pool[0];
delete now._W; delete now._H;

data.levels[STAGE-1]=now;
fs.writeFileSync(TARGET, JSON.stringify(data));
console.log(`第${STAGE}面を作り直しました (候補${pool.length}面から)\n`);
console.log('== 元 ==  '+oldW+'x'+oldH+' '+old.p+'手 罠'+old.tr+'% '+(old.sh||''));
console.log(old.b.split('/').join('\n'));
console.log('\n== 新 ==  '+now.p+'手 罠'+now.tr+'% 詰む'+now.g+'/3 '+now.sh+' '+now.ar);
console.log(now.b.split('/').join('\n'));
