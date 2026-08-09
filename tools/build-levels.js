'use strict';
/* 面プールを作って warehouse/levels.json に書き出すツール。
 *
 *   node tools/build-levels.js [面数] [出力先]
 *
 * やっていること:
 *   1. 完全ランダムな盤面を作り、その【全状態】から解ける配置の集合を厳密に求める
 *   2. 解ける配置をいくつも評価し、難易度スコアを付ける
 *   3. 回転・鏡像を正規化して重複を落とす
 *   4. スコア順に並べたあと「局所シャッフル」して、
 *      易しい面と難しい面が混ざりつつ平均も下限も上がる並びにする
 */

const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {randomLayout, solvableStates, regionRep, greedyPolicies, analyse, mulberry32, keyOf, pushesFrom}=E;

const TOTAL   = +(process.argv[2]||2000);
const OUTPUT  = process.argv[3]||path.join(__dirname,'..','warehouse','levels.json');
const SEED    = 20260809;          // 並びを再現できるよう固定
const WINDOW  = 40;                // 局所シャッフルの窓幅 = 難易度のばらけ具合
const POOL_X  = 5;                 // 目標数の何倍の候補を作ってから間引くか
const EASE    = 0.75;              // <1 で易しい側の混雑を圧縮する(順位の進み方)

/* ================= 盤面の文字表現 (XSB) ================= */
// # 壁 / 空白 床 / $ 荷物 / . 置き場 / * 置き場の上の荷物 / @ 人 / + 置き場の上の人
function toXSB(p){
  const bs=new Set(p.boxes), gs=new Set(p.goals);
  const rows=[];
  for(let y=0;y<p.h;y++){
    let line='';
    for(let x=0;x<p.w;x++){
      const i=y*p.w+x;
      line += p.grid[i] ? '#'
            : bs.has(i) ? (gs.has(i)?'*':'$')
            : i===p.player ? (gs.has(i)?'+':'@')
            : gs.has(i) ? '.' : ' ';
    }
    rows.push(line);
  }
  return rows;
}
function fromXSB(rows){
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

/* ================= 回転・鏡像をまとめた正規形 ================= */
function transforms(rows){
  const out=[];
  let cur=rows;
  for(let r=0;r<4;r++){
    out.push(cur.join('/'));
    out.push(cur.map(line=>[...line].reverse().join('')).join('/'));   // 左右反転
    // 90度回転
    const h=cur.length, w=Math.max(...cur.map(x=>x.length));
    const rot=[];
    for(let x=0;x<w;x++){
      let line='';
      for(let y=h-1;y>=0;y--) line+=(cur[y][x]||'#');
      rot.push(line);
    }
    cur=rot;
  }
  return out;
}
const canonical=rows=>transforms(rows).sort()[0];

function hashId(str){
  // FNV-1a 32bit を2回まわして8桁にする
  const fnv=(s,seed)=>{
    let h=seed>>>0;
    for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619)>>>0; }
    return h>>>0;
  };
  return (fnv(str,2166136261).toString(16).padStart(8,'0')
        + fnv(str,913).toString(16).padStart(8,'0')).slice(0,10);
}

/* ================= 1盤面から候補を集める ================= */
function harvest(rng, out, seen, cfg){
  const W=3+(rng()*4|0), H=3+(rng()*4|0);          // 3x3 〜 6x6
  const layout=randomLayout(rng,W,H,0.04+rng()*0.30);
  if(!layout) return;
  const {grid,w}=layout;
  const floors=[];
  for(let i=0;i<grid.length;i++) if(!grid[i]) floors.push(i);
  const nbox=2+(rng()*3|0);                        // 2〜4個
  if(floors.length<nbox*3+2||floors.length>30) return;

  // 置き場も完全ランダム
  const pool=floors.slice();
  for(let i=pool.length-1;i>0;i--){ const j=rng()*(i+1)|0; [pool[i],pool[j]]=[pool[j],pool[i]]; }
  const goals=pool.slice(0,nbox).sort((a,b)=>a-b);

  const dist=solvableStates(grid,w,goals,200000);
  if(!dist) return;
  const policies=greedyPolicies(grid,w,goals);

  // 解ける配置のうち、手数が短めのものから無作為に評価する
  const cands=[];
  for(const [k,d] of dist){
    if(d<3||d>16) continue;
    const rep=k.charCodeAt(0);
    const boxes=[];
    for(let i=1;i<k.length;i++) boxes.push(k.charCodeAt(i));
    cands.push({boxes,rep,d});
  }
  if(!cands.length) return;
  for(let i=cands.length-1;i>0;i--){ const j=rng()*(i+1)|0; [cands[i],cands[j]]=[cands[j],cands[i]]; }

  // 同じ壁の面ばかり増やさないよう、何通りか評価して上下から1つずつ採る
  const scored=[];
  for(const c of cands.slice(0,8)){
    const r=regionRep(grid,w,new Set(c.boxes),c.rep);
    const a=analyse(grid,w,goals,dist,{boxes:c.boxes,rep:c.rep,cells:r.cells},rng,policies);
    if(a) scored.push({c,a});
  }
  if(!scored.length) return;
  scored.sort((x,y)=>y.a.score-x.a.score);
  const picks = scored.length>1 ? [scored[0], scored[scored.length-1]] : [scored[0]];
  for(const {c,a} of picks){
    const p={grid,w:layout.w,h:layout.h,W:layout.W,H:layout.H,
             boxes:c.boxes,goals,player:c.rep,pushes:a.pushes,stats:a};
    const rows=toXSB(p);
    const key=canonical(rows);
    if(seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: hashId(key),
      b: rows.join('/'),
      p: a.pushes,
      s: +a.score.toFixed(1),
      tr: Math.round(a.trapRatio*100),
      f: a.forced,
      g: a.greedyDied,
      og: a.offGoal?1:0,
    });
  }
}

/* ================= 生成 ================= */
console.log(`面プールを作ります (目標 ${TOTAL} 面)`);
const rng=mulberry32(SEED);
const levels=[], seen=new Set();
const t0=Date.now();
const POOL_TARGET=TOTAL*POOL_X;
let attempts=0, logged=0;
while(levels.length<POOL_TARGET && attempts<POOL_TARGET*200){
  attempts++;
  harvest(rng,levels,seen,{});
  if(levels.length>=logged+1000){
    logged=levels.length;
    process.stdout.write(`  ${logged} 面 (${((Date.now()-t0)/1000).toFixed(0)}秒 / 試行${attempts}回)\n`);
  }
}
console.log(`  候補 ${levels.length} 面 / 試行 ${attempts} 回 / ${((Date.now()-t0)/1000).toFixed(0)}秒`);

/* ================= 難易度順に並べ、順位を等間隔に抜く ================= */
// スコアが同じ面は手数の少ない順(短いほど取りつきやすい)
levels.sort((a,b)=>(a.s-b.s)||(a.p-b.p));

// 候補は易しい側に固まるので、順位を進める速さに指数を掛けて混雑を圧縮する。
// 指数 <1 だと序盤ほど順位が速く進むので、同じ手応えの面が延々と続かない。
// 順位ベースなので、スコア空間で切るのと違って同じ面が二度出ることがない。
if(levels.length>TOTAL){
  const picked=[];
  let last=-1;
  for(let i=0;i<TOTAL;i++){
    const t=Math.pow(i/(TOTAL-1), EASE);
    let idx=Math.round(t*(levels.length-1));
    if(idx<=last) idx=last+1;                 // 必ず前へ進める(重複防止)
    idx=Math.min(idx, levels.length-1-(TOTAL-1-i));
    picked.push(levels[idx]);
    last=idx;
  }
  levels.length=0;
  levels.push(...picked);
}else{
  console.log(`⚠ 候補が ${levels.length} 面しかありません`);
}

// 各要素を最大 WINDOW 個先までの範囲だけで入れ替える。
// これで平均も下限も単調に上がりつつ、隣り合う面の難易度はばらける。
const srng=mulberry32(SEED^0x5bf03635);
for(let i=0;i<levels.length;i++){
  const span=Math.min(WINDOW, levels.length-i);
  const j=i+(srng()*span|0);
  [levels[i],levels[j]]=[levels[j],levels[i]];
}

/* ================= 書き出し ================= */
const payload={
  version:1,
  seed:SEED,
  window:WINDOW,
  count:levels.length,
  levels,
};
fs.writeFileSync(OUTPUT, JSON.stringify(payload));
const bytes=fs.statSync(OUTPUT).size;
console.log(`\n${OUTPUT} に ${levels.length} 面を書き出しました (${(bytes/1024).toFixed(0)}KB)`);

/* ================= 並びの確認 ================= */
const bucket=200;
console.log('\n並びの確認 (200面ごと):');
console.log('  区間        平均スコア  最低スコア  平均手数  荷物平均  罠率  素直に詰む');
for(let i=0;i<levels.length;i+=bucket){
  const seg=levels.slice(i,i+bucket);
  const avg=seg.reduce((s,x)=>s+x.s,0)/seg.length;
  const min=Math.min(...seg.map(x=>x.s));
  const ap=seg.reduce((s,x)=>s+x.p,0)/seg.length;
  const ab=seg.reduce((s,x)=>s+(x.b.match(/[$*]/g)||[]).length,0)/seg.length;
  const atr=seg.reduce((s,x)=>s+x.tr,0)/seg.length;
  const ag=seg.reduce((s,x)=>s+x.g,0)/seg.length;
  console.log(`  ${String(i+1).padStart(4)}-${String(Math.min(i+bucket,levels.length)).padEnd(5)} `
    +`${avg.toFixed(1).padStart(9)} ${min.toFixed(1).padStart(11)} `
    +`${ap.toFixed(1).padStart(9)} ${ab.toFixed(1).padStart(9)} `
    +`${atr.toFixed(0).padStart(5)}% ${ag.toFixed(1).padStart(9)}/3`);
}
module.exports={toXSB,fromXSB,canonical,hashId};
