'use strict';
/* 炎と氷ステージ版の100面を、やさしい順に作る。
 *
 *   node tools/gen-fire-ice-story.js
 */

const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','fire-ice-story','engine.js'));

const OUT=path.join(__dirname,'..','fire-ice-story','levels.json');
const SEED=20260821;

/* 帯ごとに多めに作って、スコア順に間引く。
   サイズが上がるところで一段難しくなるよう、帯の順そのものが難易度順 */
const BANDS=[
  // 2×2はレッスン2面で足りる。本編は4×4から
  {n:4, want:10, min:12, cons:6},
  {n:4, want:8,  min:8,  cons:5},
  {n:4, want:8,  min:4,  cons:4},
  {n:4, want:6,  min:0,  cons:3, extra:{tries:12, removals:4}},
  {n:6, want:12, min:22, cons:6},
  {n:6, want:8,  min:18, cons:5},
  {n:6, want:6,  min:14, cons:6},
  {n:6, want:4,  min:11, cons:6},
  {n:6, want:4,  min:6,  cons:5, extra:{tries:10, removals:3}},
  {n:6, want:4,  min:0,  cons:4, extra:{tries:16, removals:6}},
  {n:6, want:2,  min:0,  cons:2, extra:{tries:24, removals:9}},
  {n:8, want:8,  min:36, cons:10},
  {n:8, want:6,  min:28, cons:9},
  {n:8, want:6,  min:20, cons:10},
  {n:8, want:4,  min:8,  cons:6, extra:{tries:12, removals:4}},
  {n:8, want:4,  min:0,  cons:3, extra:{tries:24, removals:9}},
];

function fingerprint(n, puzzle, cons){
  return n+'|'+E.encodeGrid(puzzle)+'|'+JSON.stringify(E.encodeCons(cons));
}

function harvestBand(band, rng, seen){
  const pool=[];
  const tries=band.want*40;
  for(let i=0;i<tries && pool.length<band.want*8;i++){
    const eng=E.makeEngine(band.n, rng);
    const made=eng.makePuzzle(band.min, band.cons, band.extra);
    if(!made) continue;
    eng.setConstraints(made.consList);
    const info=eng.analyse(made.puzzle);
    if(!info.ok) continue;
    if(band.extra && info.simple) continue; // 背理法帯なのに単純推理で解けるのは落とす
    const fp=fingerprint(band.n, made.puzzle, made.consList);
    if(seen.has(fp)) continue;
    seen.add(fp);
    const score=E.difficultyScore(band.n, info);
    pool.push({
      id:E.hashId(fp),
      n:band.n,
      p:E.encodeGrid(made.puzzle),
      s:E.encodeGrid(made.solution),
      c:E.encodeCons(made.consList),
      score,
      empty:info.empty,
      hard:info.hard,
      simple:info.simple
    });
  }
  pool.sort((a,b)=>a.score-b.score || a.empty-b.empty);
  const picked=[];
  if(pool.length<=band.want) return pool;
  // 帯の中でもやさしい側から難しい側へ、均等に間引く
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
      console.warn('帯が足りない n='+band.n+' min='+band.min+' 欲しい='+band.want+' 取れた='+got.length);
    }
    levels.push(...got.slice(0, band.want));
    console.log('n='+band.n+' min='+band.min+' extra='+(band.extra?band.extra.removals:0)
      +' → '+got.length+'面 ('+(Date.now()-t0)+'ms) 累計='+levels.length);
  }

  levels.sort((a,b)=>a.n-b.n || a.score-b.score || a.empty-b.empty || a.hard-b.hard);
  const ids=new Set();
  for(const lv of levels){
    let id=lv.id, n=0;
    while(ids.has(id)){ n++; id=lv.id+n; }
    lv.id=id;
    ids.add(id);
    delete lv.simple;
    const eng=E.makeEngine(lv.n, ()=>0);
    eng.setConstraints(E.decodeCons(lv.c));
    const info=eng.analyse(E.decodeGrid(lv.p));
    if(!info.ok) throw new Error('解けない面 id='+lv.id);
  }

  const data={
    v:1,
    generated:new Date().toISOString().slice(0,10),
    levels
  };
  fs.writeFileSync(OUT, JSON.stringify(data));
  console.log('wrote '+levels.length+' levels → '+OUT);
  console.log('scores:', levels.map(l=>l.score).join(', '));
}

main();
