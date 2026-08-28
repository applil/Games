'use strict';
/* 着せ替えごとのルールで、面を作る道具。
 *
 *   node tools/gen-variant.js <ルール名> <作る数> [秒数] [種] [出力先]
 *   node tools/gen-variant.js water 20 600 1 warehouse/packs/summer.json
 *
 * 作り方は本編と同じ考え方。乱数で盤を作り、そのルールで解いて、
 * 手数が範囲に入っていて、かつ既にある面と手順が重ならないものだけを残す。
 * ルールごとに探索が違うので、engine の数え上げではなく rules.js を使う。
 *
 * 環境変数で条件を変えられる:
 *   MIN_PUSH / MAX_PUSH … 手数の範囲
 *   NBOX                … 荷物の数(例 2,4)
 *   SIZE                … 盤の大きさ。外枠を含む(例 6,9)
 *   MIN_SIDE            … 内側(壁を除いた中身)の長いほうの辺の下限(例 9)。
 *                         SIZE は縦横を別々に引くので、範囲を広げると
 *                         小さい盤も混ざる。「広い面だけ」を狙うときに使う
 *   WATER               … 水にするマスの割合(夏だけ。例 0.12)
 *   DUP                 … 手順の重なりの上限(既定 0.7)
 */
const fs=require('fs');
const path=require('path');
const {RULES}=require(path.join(__dirname,'..','warehouse','rules.js'));
const X=require(path.join(__dirname,'xsb.js'));

const RULE=process.argv[2]||'water';
const WANT=+(process.argv[3]||20);
const SEC=+(process.argv[4]||600);
const SEED=+(process.argv[5]||1);
const OUT=process.argv[6]||path.join(__dirname,'..','warehouse','packs',RULE+'.json');

const MIN_PUSH=+(process.env.MIN_PUSH||3);
const MAX_PUSH=+(process.env.MAX_PUSH||30);
const [NB_LO,NB_HI]=(process.env.NBOX||'2,4').split(',').map(Number);
const [SZ_LO,SZ_HI]=(process.env.SIZE||'6,9').split(',').map(Number);
const MIN_SIDE=+(process.env.MIN_SIDE||0);   // 内側の長辺の下限(0 なら見ない)
const WATER=+(process.env.WATER||0.12);
const DUP=+(process.env.DUP||0.7);
const MATTERS=process.env.MATTERS!=='0';   // 0 にすると「ふつうと同じ答え」も残す
const BEES=+(process.env.BEES||2);         // 春。ミツバチの数

const rule=RULES[RULE];
if(!rule){ console.error('知らないルール: '+RULE+' (あるのは '+Object.keys(RULES).join(', ')+')'); process.exit(1); }

/* ---- 乱数 ---- */
function mulberry32(a){ return function(){
  a|=0; a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15, 1|a);
  t=t+Math.imul(t^t>>>7, 61|t)^t;
  return ((t^t>>>14)>>>0)/4294967296; }; }
const rng=mulberry32(SEED*2654435761);
const pick=a=>a[Math.floor(rng()*a.length)];

/* ---- 幅優先で最短手数を出す。上限を超えたら諦める ---- */
function solve(board, cap){
  const p=rule.parse(board);
  if(!p.boxes.length || p.boxes.length!==p.goals.length || p.player<0) return null;
  if(RULE==='duo' && (!p.players || p.players.length!==BEES)) return null;
  if(RULE==='ants' && (!p.ants || !p.ants.length)) return null;
  let layer=[rule.start(p)];
  const seen=new Set([rule.key(layer[0])]);
  for(let d=0; d<=MAX_PUSH+2; d++){
    if(layer.some(s=>rule.solved(p,s))) return {d, states:seen.size};
    if(seen.size>cap) return null;
    const next=[];
    for(const st of layer) for(const m of rule.moves(p,st)){
      const k=rule.key(m.st);
      if(seen.has(k)) continue;
      seen.add(k); next.push(m.st);
    }
    if(!next.length) return null;
    layer=next;
  }
  return null;
}
/* ---- 最短手順の押し手(重なりを見るため) ---- */
function pushSet(board){
  const p=rule.parse(board);
  let layer=[{st:rule.start(p), path:[]}];
  const seen=new Set([rule.key(layer[0].st)]);
  for(let d=0; d<=MAX_PUSH+2; d++){
    for(const n of layer) if(rule.solved(p,n.st)) return n.path;
    const next=[];
    for(const n of layer) for(const m of rule.moves(p,n.st)){
      const k=rule.key(m.st);
      if(seen.has(k)) continue;
      seen.add(k);
      const yx=i=>Math.floor(i/p.w)+','+(i%p.w);
      next.push({st:m.st, path:n.path.concat(yx(m.box)+'>'+yx(m.to))});
    }
    if(!next.length) return null;
    layer=next;
  }
  return null;
}
/* そのルールが効いているか。
   ふつうのルール(水を床として扱う、穴を置き場として扱う…)で解いた結果と
   同じ手数なら、その面は着せ替えの意味がない飾りでしかない。
   「ふつうでは解けるのに、このルールでは手数が増える(または解けない)」
   を満たす面だけを残す */
function mattersVsPlain(board, d){
  const p=RULES.plain.parse(board);
  if(!p.boxes.length) return false;
  let layer=[RULES.plain.start(p)];
  const seen=new Set([RULES.plain.key(layer[0])]);
  for(let k=0; k<=d; k++){
    if(layer.some(s=>RULES.plain.solved(p,s))) return k!==d;   // 同じ手数なら飾り
    const next=[];
    for(const st of layer) for(const m of RULES.plain.moves(p,st)){
      const key=RULES.plain.key(m.st);
      if(seen.has(key)) continue;
      seen.add(key); next.push(m.st);
    }
    if(!next.length) return true;                               // ふつうでは解けない
    layer=next;
  }
  return true;                                                  // ふつうのほうが長い
}
const overlap=(A,B)=>{
  if(!A||!B) return 0;
  const sa=new Set(A), sb=new Set(B);
  let n=0; for(const v of sa) if(sb.has(v)) n++;
  const u=sa.size+sb.size-n;
  return u? n/u : 0;
};

/* ---- 盤を作る ---- */
function makeBoard(){
  const W=SZ_LO+Math.floor(rng()*(SZ_HI-SZ_LO+1));
  const H=SZ_LO+Math.floor(rng()*(SZ_HI-SZ_LO+1));
  // 縦横を別々に引くので、範囲を広げると小さい盤も混ざる。
  // 広い面だけを狙うときは、ここで内側の長辺を見て捨てる
  if(MIN_SIDE && Math.max(W,H)-2 < MIN_SIDE) return null;
  const g=[];
  for(let y=0;y<H;y++){ const r=[];
    for(let x=0;x<W;x++) r.push((y===0||x===0||y===H-1||x===W-1) ? '#' : (rng()<0.18?'#':' '));
    g.push(r); }
  // 床が繋がっているところだけ残す
  const floors=[];
  for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++) if(g[y][x]===' ') floors.push([y,x]);
  if(floors.length<8) return null;
  const seen=new Set(), st=[floors[0]]; seen.add(floors[0].join(','));
  while(st.length){ const [y,x]=st.pop();
    for(const [dy,dx] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const ny=y+dy, nx=x+dx;
      if(ny<1||nx<1||ny>=H-1||nx>=W-1) continue;
      if(g[ny][nx]!==' ') continue;
      const k=ny+','+nx; if(seen.has(k)) continue;
      seen.add(k); st.push([ny,nx]); } }
  const room=floors.filter(([y,x])=>seen.has(y+','+x));
  if(room.length<8) return null;
  for(const [y,x] of floors) if(!seen.has(y+','+x)) g[y][x]='#';

  const cells=room.slice();
  for(let i=cells.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [cells[i],cells[j]]=[cells[j],cells[i]]; }
  const n=NB_LO+Math.floor(rng()*(NB_HI-NB_LO+1));
  if(cells.length < n*2+1+2+(RULE==='duo'?BEES-1:0)+(RULE==='ants'?2:0)) return null;
  let k=0;
  for(let i=0;i<n;i++){ const [y,x]=cells[k++]; g[y][x]='$'; }
  for(let i=0;i<n;i++){ const [y,x]=cells[k++]; g[y][x]='.'; }
  const [py,px]=cells[k++]; g[py][px]='@';
  // 春はミツバチが複数。BEES で何匹かを決める(既定2匹)
  if(RULE==='duo'){
    for(let i=1;i<BEES;i++){
      if(k>=cells.length) return null;
      const [qy,qx]=cells[k++]; g[qy][qx]='@';
    }
  }
  // 印あわせ。荷物と置き場のうち何個かに印(1〜9 / a〜i)を付ける。
  // 印を付ける数は毎回変える。全部に付く面も、一部だけの面も出る
  if(RULE==='marks'){
    const nm = 1 + Math.floor(rng()*n);                 // 何個に印を付けるか
    const idx=[...Array(n).keys()];
    for(let i=idx.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [idx[i],idx[j]]=[idx[j],idx[i]]; }
    const perm=idx.slice(0,nm);                          // 置き場のどれに、どの印を付けるか
    let bi=0, gi=0;
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      if(g[y][x]==='$'){ const k=bi++; if(k<nm) g[y][x]='123456789'[k]; }
    }
    // 置き場は、印の付いた荷物と1対1になるように選ぶ
    const goals=[];
    for(let y=0;y<H;y++) for(let x=0;x<W;x++) if(g[y][x]==='.') goals.push([y,x]);
    for(let k=0;k<nm;k++){
      const [gy,gx]=goals[perm[k]];
      g[gy][gx]='abcdefghi'[k];
    }
  }
  // 蟻は、同僚を1〜2匹置く
  if(RULE==='ants'){
    const many=1+Math.floor(rng()*2);
    for(let i=0;i<many;i++){
      if(k>=cells.length) return null;
      const [qy,qx]=cells[k++]; g[qy][qx]='&';
    }
  }
  // 水を置く(残りの床から)
  if(RULE==='water'){
    const rest=cells.slice(k);
    const many=Math.max(1, Math.round(rest.length*WATER));
    for(let i=0;i<many && i<rest.length;i++){ const [y,x]=rest[i]; g[y][x]='~'; }
  }
  return g.map(r=>r.join('')).join('/');
}

/* ---- 集める ---- */
let out=[];
try{ out=JSON.parse(fs.readFileSync(OUT,'utf8')).levels||[]; }catch(e){}
const sets=out.map(l=>pushSet(l.b)).filter(Boolean);
const ids=new Set(out.map(l=>l.id));

const t0=Date.now();
let tried=0;
while(out.length<WANT && (Date.now()-t0)/1000 < SEC){
  tried++;
  const b=makeBoard();
  if(!b) continue;
  const r=solve(b, 200000);
  if(!r || r.d<MIN_PUSH || r.d>MAX_PUSH) continue;
  // ふつうと同じ答えになる面は捨てる。ただしチュートリアルは
  // 「ふつうと同じ手数でも、交代の仕方だけを見せたい」ことがあるので外せる
  if(MATTERS && RULE!=='plain' && !mattersVsPlain(b, r.d)) continue;
  const id=X.hashId(X.canonical(b.split('/')));
  if(ids.has(id)) continue;
  const ps=pushSet(b);
  if(!ps) continue;
  let dup=false;
  for(const s of sets) if(overlap(ps,s)>=DUP){ dup=true; break; }
  if(dup) continue;
  ids.add(id); sets.push(ps);
  out.push({id, b, p:r.d, nbox:(b.match(/[$*]/g)||[]).length,
            floors:(b.match(/[ .$*@+~]/g)||[]).length});
  out.sort((a,b2)=>a.p-b2.p);
  try{ fs.mkdirSync(path.dirname(OUT),{recursive:true}); }catch(e){}
  fs.writeFileSync(OUT, JSON.stringify({rule:RULE, levels:out}, null, 1));
  console.log(`${out.length}面目 ${r.d}手 荷物${out[out.length-1].nbox} (${tried}回試して ${((Date.now()-t0)/1000).toFixed(0)}秒)`);
}
console.log(`\n${OUT} に ${out.length}面 (${tried}回試行 / ${((Date.now()-t0)/1000).toFixed(1)}秒)`);
