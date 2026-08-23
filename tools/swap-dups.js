'use strict';
/* 押し手が重なっている面を、在庫の面と差し替える。
 *
 *   node tools/swap-dups.js [線] [--write]
 *   node tools/swap-dups.js 0.7          … 下見
 *   node tools/swap-dups.js 0.7 --write  … 実際に差し替える
 *
 * 「同じ部屋」だけでは重複と言えない。壁と置き場が同じでも、押す荷物・運ぶ先・
 * 順番が違えば別の面になる(第496面と第501面は同じ部屋・同じ22手だが重なり0.30)。
 * そこで最短手順の押し手の集合を比べ、重なりが線を超えた組だけを重複とみなす。
 *
 * 組を辺とみなして連結成分にまとめ、各成分から1面だけ残す。残すのは
 * 一番手前にある面(遊ばれている可能性が高いほうを動かさない)。
 *
 * 差し替え先は、その面と同じ手数の在庫から選ぶ。手数を変えないので、
 * 章ごとの中央値も、境目も、山の位置も動かない。
 * 選んだ面は、残す全ての面と押し手の重なりが線未満であることを確かめる。
 *
 * 動かさない範囲について。tools/frozen.js の線は「順番を動かさない」ための約束で、
 * 中身の入れ替えは順番を変えないので、この線は関係ない。
 * 代わりに、第1〜300面は中身も触らない。ここは実際に遊ばれていて、
 * 差し替えるとクリア記録がその面を指さなくなるため。
 * 301面以降は、まだほとんど誰も到達していないので入れ替えてよい。
 */
const fs=require('fs');
const path=require('path');
const {FROZEN}=require(path.join(__dirname,'frozen.js'));
const {minPushes}=require(path.join(__dirname,'astar.js'));

const TH=+(process.argv[2]||0.7);
const WRITE=process.argv.includes('--write');
const FILE=path.join(__dirname,'..','warehouse','levels.json');
const data=JSON.parse(fs.readFileSync(FILE,'utf8'));
const L=data.levels;
const STOCK=path.join(__dirname,'stock');

/* ---- 向きを揃える ---- */
const toGrid=b=>{ const r=b.split('/'); const w=Math.max(...r.map(x=>x.length));
  return r.map(x=>x.padEnd(w,'#').split('')); };
const rot=g=>{ const h=g.length,w=g[0].length,o=[];
  for(let x=0;x<w;x++){ const r=[]; for(let y=h-1;y>=0;y--) r.push(g[y][x]); o.push(r); } return o; };
const flip=g=>g.map(r=>r.slice().reverse());
const show=g=>g.map(r=>r.join('')).join('/');
const roomOf=g=>g.map(r=>r.map(c=>c==='#'?'#':(c==='.'||c==='*'||c==='+')?'.':' '));
function canon(b){
  let c=toGrid(b), k=null, bd=null;
  for(let i=0;i<4;i++){
    for(const v of [c, flip(c)]){ const s=show(roomOf(v)); if(k===null||s<k){ k=s; bd=v; } }
    c=rot(c);
  }
  return {key:k, board:show(bd)};
}
/* ---- 最短手順の押し手 ---- */
function parse(board){
  const rows=board.split('/');
  const h=rows.length, w=Math.max(...rows.map(r=>r.length));
  const grid=new Uint8Array(w*h).fill(1);
  const boxes=[], goals=[]; let player=-1;
  for(let y=0;y<h;y++){ const row=rows[y].padEnd(w,'#');
    for(let x=0;x<w;x++){ const c=row[x], i=y*w+x; if(c==='#') continue; grid[i]=0;
      if(c==='$'||c==='*') boxes.push(i);
      if(c==='.'||c==='*'||c==='+') goals.push(i);
      if(c==='@'||c==='+') player=i; } }
  return {grid,w,h,boxes:boxes.sort((a,b)=>a-b),goals:goals.sort((a,b)=>a-b),player};
}
const PS=path.join(STOCK,'pushset.json');
let cache={};
for(const f of fs.readdirSync(STOCK)) if(/^pushset(\.\d+)?\.json$/.test(f))
  Object.assign(cache, JSON.parse(fs.readFileSync(path.join(STOCK,f),'utf8')));
function pushSet(id, b){
  if(id && cache[id]!==undefined) return cache[id];
  const c=canon(b), p=parse(c.board);
  const opt={nodes:2e6, path:true};
  const d=minPushes(p.grid,p.w,p.goals,p.boxes,p.player,opt);
  const v=(d===undefined||d===null||!Array.isArray(opt.path)) ? null
        : opt.path.map(m=>{ const yx=i=>Math.floor(i/p.w)+','+(i%p.w); return yx(m.box)+'>'+yx(m.to); });
  if(id){ cache[id]=v; try{ fs.writeFileSync(PS, JSON.stringify(cache)); }catch(e){} }
  return v;
}
const overlap=(A,B)=>{
  if(!A||!B) return 0;
  const sa=new Set(A), sb=new Set(B);
  let n=0; for(const v of sa) if(sb.has(v)) n++;
  const u=sa.size+sb.size-n;
  return u? n/u : 0;
};

/* ---- 重複の組から、落とす面を決める ---- */
const pairs=JSON.parse(fs.readFileSync(path.join(STOCK,'roomdup.json'),'utf8'));
const par={}; const find=x=>par[x]===undefined?(par[x]=x):(par[x]===x?x:(par[x]=find(par[x])));
pairs.filter(p=>p.重なり>=TH).forEach(p=>{ const a=find(p.a), b=find(p.b); if(a!==b) par[a]=b; });
const comp={};
Object.keys(par).forEach(k=>{ const r=find(+k); (comp[r]=comp[r]||[]).push(+k); });
const drop=[];
Object.values(comp).forEach(g=>{ g.sort((a,b)=>a-b); g.slice(1).forEach(n=>drop.push(n)); });
drop.sort((a,b)=>a-b);
const PLAYED=+(process.env.PLAYED||300);        // ここまでは中身も触らない
const playedHit=drop.filter(n=>n<=PLAYED);
const targets=drop.filter(n=>n>PLAYED);
console.log(`線${TH}: 落とす面 ${drop.length}面`);
console.log(`  うち第${PLAYED}面まで(遊ばれている範囲): ${playedHit.length}面 — 触らない: ${playedHit.join(' ')||'なし'}`);
console.log(`  差し替える面: ${targets.length}面`);
console.log(`  (順番は動かさないので、第${FROZEN}面までの固定とは衝突しない)`);

/* ---- 在庫を読む ---- */
const used=new Set(L.map(l=>l.id));
const pool=[];
for(const f of fs.readdirSync(STOCK)){
  if(!f.endsWith('.json') || /^(verified|latewalk|naive|twins|similar|roomdup|pushset)/.test(f)) continue;
  try{
    const j=JSON.parse(fs.readFileSync(path.join(STOCK,f),'utf8'));
    for(const x of (Array.isArray(j)?j:(j.levels||j.picks||[]))){
      if(x && x.b && x.id && !used.has(x.id)) pool.push(x);
    }
  }catch(e){}
}
const seen=new Set();
const stock=pool.filter(x=>{ if(seen.has(x.id)) return false; seen.add(x.id); return true; });
const byP={};
stock.forEach(x=>{ (byP[x.p]=byP[x.p]||[]).push(x); });
console.log(`  在庫(未使用): ${stock.length}面`);

/* ---- 差し替える ----
   突き合わせるのは「同じ部屋の面」だけでよい。部屋が違えば壁も置き場も違うので、
   押し手が重なりようがない。残す面すべてと突き合わせると、深い面の最短手順を
   何百枚も計算することになり、何時間経っても終わらない */
const dropSet=new Set(drop);
const roomKeep=new Map();                                  // 部屋の鍵 → 残す面
L.forEach((l,i)=>{
  if(dropSet.has(i+1)) return;
  const k=canon(l.b).key;
  if(!roomKeep.has(k)) roomKeep.set(k,[]);
  roomKeep.get(k).push(l);
});
const swapped=[], failed=[];
/* 手数はぴったり合わせたいが、深いところは在庫が細く、待っていると終わらない。
   TOL を指定すると前後 TOL 手までを許す。許した場合は、あとで帯の中を
   手数順に並べ直すこと(第430面以降は並べ替えてよい) */
const TOL=+(process.env.TOL||0);
for(const at of targets){
  const want=L[at-1].p;
  let cands=(byP[want]||[]).slice();
  for(let d=1; d<=TOL && !cands.length; d++)
    cands=(byP[want-d]||[]).concat(byP[want+d]||[]);
  let picked=null;
  for(const c of cands){
    const k=canon(c.b).key;
    const mates=roomKeep.get(k);
    if(!mates || !mates.length){ picked=c; break; }        // 同じ部屋が無いなら文句なし
    const s=pushSet(null, c.b);
    if(!s) continue;
    let ok=true;
    for(const m of mates){ if(overlap(s, pushSet(m.id, m.b))>=TH){ ok=false; break; } }
    if(!ok) continue;
    picked=c; break;
  }
  if(!picked){ failed.push(at+'('+want+'手)'); continue; }
  byP[picked.p]=(byP[picked.p]||[]).filter(x=>x.id!==picked.id);
  const k=canon(picked.b).key;
  if(!roomKeep.has(k)) roomKeep.set(k,[]);
  roomKeep.get(k).push(picked);                            // 次の候補はこれとも比べる
  L[at-1]={...picked};                                     // 手数は在庫の実測値のまま
  swapped.push(at);
}
console.log(`\n差し替えた: ${swapped.length}面`);
if(failed.length) console.log(`在庫が足りず残った: ${failed.length}面 — ${failed.slice(0,20).join(' ')}${failed.length>20?' …':''}`);

if(WRITE && swapped.length){
  if(new Set(L.map(l=>l.id)).size!==L.length) throw new Error('IDが重複しました');
  fs.writeFileSync(FILE, JSON.stringify(data));
  console.log('\n書き出しました: '+FILE);
}else{
  console.log('\n(下見です。書き込むには --write を付けてください)');
}
