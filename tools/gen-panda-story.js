'use strict';
/* パンダと竹ステージ版の100面を、やさしい順に作る。
 *
 *   node tools/gen-panda-story.js
 */

const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','panda-story','engine.js'));

const OUT=path.join(__dirname,'..','panda-story','levels.json');
const SEED=20260821;

const BANDS=[
  {n:2, want:8,  div:4.0, depth:0, target:1},
  {n:3, want:10, div:9.0, depth:0, target:1, maxRounds:4},
  {n:3, want:8,  div:4.0, depth:0, target:2},
  {n:4, want:10, div:5.0, depth:0, target:2, maxRounds:4},
  {n:4, want:8,  div:4.0, depth:0, target:3},
  {n:4, want:6,  div:4.4, depth:1, target:3, minHard:1},
  {n:5, want:8,  div:4.2, depth:0, maxRounds:4},
  {n:5, want:6,  div:4.4, depth:1, minHard:1},
  {n:7, want:8,  div:4.2, depth:0, maxRounds:5},
  {n:7, want:6,  div:4.4, depth:1, minHard:1},
  {n:7, want:4,  div:4.8, depth:1, minHard:3},
  {n:9, want:6,  div:4.2, depth:0, maxRounds:6},
  {n:9, want:4,  div:4.4, depth:1, minHard:1},
  {n:9, want:8,  div:4.8, depth:1, minHard:3},
];

function harvestBand(band, rng, seen){
  const pool=[];
  const tries=band.want*(band.depth?200:80);
  for(let i=0;i<tries && pool.length<band.want*10;i++){
    const p=E.generatePuzzle(band.n, band.div, rng, band.target);
    if(!p) continue;
    const r0=E.deduce(p, 0);
    if(band.depth===0){
      if(!r0.solved) continue;
      if(band.maxRounds!=null && r0.rounds>band.maxRounds) continue;
      const fp=E.fingerprint(p);
      if(seen.has(fp)) continue;
      seen.add(fp);
      const packed=E.packPuzzle(p);
      pool.push({
        id:E.hashId(fp),
        ...packed,
        score:E.difficultyScore(band.n, {hard:0, rounds:r0.rounds, depth:0}),
        hard:0,
        rounds:r0.rounds
      });
    }else{
      if(r0.solved) continue;
      const r1=E.deduce(p, 1);
      if(!r1.solved) continue;
      if(band.minHard!=null && r1.hard<band.minHard) continue;
      const fp=E.fingerprint(p);
      if(seen.has(fp)) continue;
      seen.add(fp);
      const packed=E.packPuzzle(p);
      pool.push({
        id:E.hashId(fp),
        ...packed,
        score:E.difficultyScore(band.n, {hard:r1.hard, rounds:r1.rounds, depth:1}),
        hard:r1.hard,
        rounds:r1.rounds
      });
    }
  }
  pool.sort((a,b)=>a.score-b.score || a.rounds-b.rounds || a.hard-b.hard);
  if(pool.length<=band.want) return pool;
  const picked=[];
  for(let i=0;i<band.want;i++){
    const idx=Math.round(i*(pool.length-1)/(band.want-1));
    picked.push(pool[idx]);
  }
  return picked;
}

function main(){
  const rng=E.mulberry32(SEED);
  const seen=new Set();
  const levels=[];
  for(const band of BANDS){
    const t0=Date.now();
    const got=harvestBand(band, rng, seen);
    if(got.length<band.want){
      console.warn('帯が足りない n='+band.n+' depth='+band.depth+' 欲しい='+band.want+' 取れた='+got.length);
    }
    levels.push(...got.slice(0, band.want));
    console.log('n='+band.n+' depth='+band.depth+' minHard='+(band.minHard||0)
      +' → '+got.length+'面 ('+(Date.now()-t0)+'ms) 累計='+levels.length);
  }

  for(const fill of [
    {n:5, div:4.2, depth:0},
    {n:5, div:4.4, depth:1, minHard:1},
    {n:7, div:4.2, depth:0},
  ]){
    if(levels.length>=100) break;
    fill.want=100-levels.length;
    const t0=Date.now();
    const got=harvestBand(fill, rng, seen);
    levels.push(...got.slice(0, fill.want));
    console.log('補充 n='+fill.n+' → +'+got.length+' 累計='+levels.length+' ('+(Date.now()-t0)+'ms)');
  }
  if(levels.length>100) levels.length=100;

  levels.sort((a,b)=>a.n-b.n || a.score-b.score || a.hard-b.hard || a.rounds-b.rounds);
  const ids=new Set();
  for(const lv of levels){
    let id=lv.id, n=0;
    while(ids.has(id)){ n++; id=lv.id+n; }
    lv.id=id;
    ids.add(id);
    const p=E.unpackPuzzle(lv);
    const r=E.deduce(p, 1);
    if(!r.solved) throw new Error('解けない面 id='+lv.id);
  }

  const data={
    v:1,
    generated:new Date().toISOString().slice(0,10),
    levels
  };
  fs.writeFileSync(OUT, JSON.stringify(data));
  console.log('wrote '+levels.length+' levels → '+OUT);
  console.log('n:', levels.map(l=>l.n).join(','));
  console.log('scores:', levels.map(l=>l.score).join(', '));
}

main();
