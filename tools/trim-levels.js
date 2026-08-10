'use strict';
/* 盤の端にある「何も置かれていない列・行」を削って、面を小さくするツール。
 *
 *   node tools/trim-levels.js <面番号,...> [levels.json]
 *
 * 左→下→右→上 の順に、こうする:
 *   1. その端から、ヒヨコも荷物も置き場もない列(行)が何本続くか数える
 *   2. その半分を削ってみて、遊びが変わらなければ採用
 *   3. だめなら4分の1だけ削ってみる
 *   4. それもだめなら削らない
 * 1辺あたり最大2回、4辺で最大8回しか確かめないので速い。
 * 余白を全部そぎ落とすのではなく、明らかに多すぎるぶんだけ落とす。
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const X=require(path.join(__dirname,'xsb.js'));

const ARG=process.argv[2]||'';
const TARGET=process.argv[3]||path.join(__dirname,'..','warehouse','levels.json');

const PIECES=new Set(['@','+','$','*','.']);      // ヒヨコ・荷物・置き場

// 遊びが変わっていないかを見る指紋。最短手数だけでなく、
// 出せる押し手と詰む押し手の数まで一致して初めて「同じゲーム」とみなす
function fingerprint(board){
  const p=X.fromXSB(board.split('/'));
  const table=E.solvableStates(p.grid,p.w,p.goals,3000000);
  if(!table) return null;
  const reg=E.regionRep(p.grid,p.w,new Set(p.boxes),p.player);
  const k0=E.keyOf(p.boxes.slice().sort((a,b)=>a-b), reg.rep);
  if(!table.has(k0)) return null;
  const seen=new Map([[k0,{boxes:p.boxes.slice().sort((a,b)=>a-b), cells:reg.cells}]]);
  const q=[k0]; let moves=0, dead=0;
  while(q.length){
    const k=q.shift(); const s=seen.get(k);
    for(const m of E.pushesFrom(p.grid,p.w,s.boxes,s.cells)){
      moves++;
      if(!table.has(m.key)){ dead++; continue; }
      if(seen.has(m.key)) continue;
      seen.set(m.key,{boxes:m.boxes.slice().sort((a,b)=>a-b), cells:m.cells});
      q.push(m.key);
    }
  }
  return {pushes:table.get(k0), states:seen.size, moves, dead};
}
const same=(a,b)=>!!a&&!!b&&a.pushes===b.pushes&&a.states===b.states&&a.moves===b.moves&&a.dead===b.dead;

const toGrid=b=>b.split('/').map(r=>r.split(''));
const toStr =g=>g.map(r=>r.join('')).join('/');
const rot=g=>{                                    // 右に90度。左辺の処理を使い回すため
  const h=g.length, w=g[0].length, out=[];
  for(let x=0;x<w;x++){ const row=[]; for(let y=h-1;y>=0;y--) row.push(g[y][x]); out.push(row); }
  return out;
};

// 左端から、駒の載っていない内側の列が何本続くか(外周の壁は数えない)
function emptyLeft(g){
  const w=g[0].length;
  let n=0;
  for(let x=1;x<w-1;x++){
    let has=false;
    for(let y=0;y<g.length;y++) if(PIECES.has(g[y][x])){ has=true; break; }
    if(has) break;
    n++;
  }
  return n;
}
// 左から k 列削る(外周の壁は残す)
function cutLeft(g,k){
  return g.map(r=>[r[0]].concat(r.slice(1+k)));
}

function trim(board){
  const base=fingerprint(board);
  if(!base) return {board, error:'測れませんでした'};
  let g=toGrid(board);
  const log=[];
  let checks=0;
  // rot は時計回りなので、左を処理するたびに 左→下→右→上 の順で回ってくる
  for(const side of ['左','下','右','上']){
    const e=emptyLeft(g);
    if(e>=2){
      for(const k of [e>>1, e>>2]){               // 半分 → 4分の1 の順に試す
        if(k<1) continue;
        checks++;
        const test=toStr(cutLeft(g,k));
        if(same(base, fingerprint(test))){ g=toGrid(test); log.push(side+'から'+k+'列'); break; }
      }
    }
    g=rot(g);                                     // 次の辺を左に持ってくる
  }
  return {board:toStr(g), base, log, checks};
}

const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));
const targets=ARG.split(',').map(Number).filter(n=>n>=1&&n<=data.levels.length);
if(!targets.length){ console.error('使い方: node tools/trim-levels.js <面番号,...> [levels.json]'); process.exit(1); }

const size=b=>{ const r=b.split('/'); return (r[0].length-2)+'x'+(r.length-2); };
let changed=0, saved=0;
const t0=Date.now();
for(const s of targets){
  const lv=data.levels[s-1];
  const before=lv.b;
  const r=trim(before);
  if(r.error){ console.log(`第${s}面: ${r.error}`); continue; }
  if(r.board===before){ continue; }
  const a=before.split('/'), b=r.board.split('/');
  saved += (a[0].length*a.length)-(b[0].length*b.length);
  lv.b=r.board;
  lv.id=X.hashId(X.canonical(r.board.split('/')));
  changed++;
  console.log(`第${String(s).padStart(3)}面 ${size(before).padStart(7)} → ${size(r.board).padStart(7)}`
    +`  (${r.log.join(' / ')})  最短${r.base.pushes}手のまま  確認${r.checks}回`);
}
if(changed){
  data.count=data.levels.length;
  fs.writeFileSync(TARGET, JSON.stringify(data));
}
console.log(`\n${changed}/${targets.length}面を小さくしました (計${saved}マス / ${((Date.now()-t0)/1000).toFixed(0)}秒)`);
