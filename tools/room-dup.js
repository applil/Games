'use strict';
/* 同じ部屋の面どうしが、本当に同じ面かを「解く手順」で判定する。
 *
 *   node tools/room-dup.js
 *   SHARDS=4 SHARD=0 node tools/room-dup.js     … 4分割で同時に
 *
 * 壁と置き場が同じでも、それだけでは重複と言えない。
 * 押す荷物も、運ぶ先も、順番も違うなら、遊んだ感じは別物になる。
 * 逆に、片方がもう片方の数手先の局面でしかないなら、押し手がほぼ丸かぶりになる。
 * これが第321面と第322面で起きていたこと。
 *
 * そこで、最短手順に出てくる押し手を「どのマスから、どのマスへ」の集合にして、
 * 重なり具合(共通 ÷ 合計)を見る。1.0 なら完全に同じ手順、0 なら一つも共通しない。
 *
 * 向きの違いを揃えるため、盤は先に「部屋の鍵」と同じ向きに直してから測る。
 */
const fs=require('fs');
const path=require('path');
const {minPushes}=require(path.join(__dirname,'astar.js'));

const SHARDS=+(process.env.SHARDS||1), SHARD=+(process.env.SHARD||0);
const NODES=+(process.env.NODES||2e6);
const FILE=process.argv[2]||path.join(__dirname,'..','warehouse','levels.json');
const L=JSON.parse(fs.readFileSync(FILE,'utf8')).levels;

/* ---- 盤を文字のマス目に開く / 向きを変える ---- */
function toGrid(b){
  const rows=b.split('/');
  const h=rows.length, w=Math.max(...rows.map(r=>r.length));
  return rows.map(r=>r.padEnd(w,'#').split(''));
}
const rot=g=>{
  const h=g.length, w=g[0].length, o=[];
  for(let x=0;x<w;x++){ const r=[]; for(let y=h-1;y>=0;y--) r.push(g[y][x]); o.push(r); }
  return o;
};
const flip=g=>g.map(r=>r.slice().reverse());
const show=g=>g.map(r=>r.join('')).join('/');
const roomOf=g=>g.map(r=>r.map(c=>c==='#'?'#':(c==='.'||c==='*'||c==='+')?'.':' '));

// 部屋の鍵と、そのときの盤(向きを揃えたもの)
function canon(b){
  let c=toGrid(b), bestKey=null, bestBoard=null;
  for(let i=0;i<4;i++){
    for(const v of [c, flip(c)]){
      const k=show(roomOf(v));
      if(bestKey===null||k<bestKey){ bestKey=k; bestBoard=v; }
    }
    c=rot(c);
  }
  return {key:bestKey, board:show(bestBoard)};
}

/* ---- 最短手順に出てくる押し手の集合 ---- */
function parse(board){
  const rows=board.split('/');
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
function pushSet(board){
  const p=parse(board);
  const opt={nodes:NODES, path:true};
  const d=minPushes(p.grid,p.w,p.goals,p.boxes,p.player,opt);
  if(d===undefined||d===null||!Array.isArray(opt.path)) return null;
  const yx=i=>Math.floor(i/p.w)+','+(i%p.w);
  return opt.path.map(m=>yx(m.box)+'>'+yx(m.to));
}

/* ---- 控え(担当ごとに別ファイル。同時に走らせても消し合わない) ---- */
const STOCK=path.join(__dirname,'stock');
const MINE=path.join(STOCK,`pushset.${SHARD}.json`);
function loadAll(){
  const out={};
  try{
    for(const f of fs.readdirSync(STOCK)){
      if(!/^pushset(\.\d+)?\.json$/.test(f)) continue;
      Object.assign(out, JSON.parse(fs.readFileSync(path.join(STOCK,f),'utf8')));
    }
  }catch(e){}
  return out;
}
const done=loadAll();
let mine={}; try{ mine=JSON.parse(fs.readFileSync(MINE,'utf8')); }catch(e){}
function remember(id,v){
  done[id]=v; mine[id]=v;
  try{ fs.writeFileSync(MINE+'.tmp', JSON.stringify(mine)); fs.renameSync(MINE+'.tmp', MINE); }catch(e){}
}

/* ---- 同じ部屋の面をまとめる ---- */
const groups=new Map();
L.forEach((lv,i)=>{
  const c=canon(lv.b);
  if(!groups.has(c.key)) groups.set(c.key,[]);
  groups.get(c.key).push({at:i+1, id:lv.id, p:lv.p, board:c.board});
});
const twins=[...groups.values()].filter(g=>g.length>1);
const targets=[];
twins.forEach(g=>g.forEach(x=>targets.push(x)));

const t0=Date.now();
let n=0;
targets.forEach((x,k)=>{
  if(k%SHARDS!==SHARD) return;
  if(done[x.id]!==undefined) return;
  const s=pushSet(x.board);
  remember(x.id, s);
  n++;
  process.stderr.write(`[${SHARD}] 第${x.at}面 ${((Date.now()-t0)/1000).toFixed(0)}秒\n`);
});
console.log(`担当${SHARD}: ${n}面を測定 (${((Date.now()-t0)/1000).toFixed(1)}秒) / 対象 ${targets.length}面`);

/* ---- 出そろっていれば、組ごとの重なりを出す ---- */
const have=loadAll();
if(targets.every(x=>have[x.id]!==undefined)){
  const pairs=[];
  for(const g of twins){
    for(let i=0;i<g.length;i++) for(let j=i+1;j<g.length;j++){
      const A=have[g[i].id], B=have[g[j].id];
      if(!A||!B) continue;
      const sa=new Set(A), sb=new Set(B);
      let inter=0; for(const v of sa) if(sb.has(v)) inter++;
      const uni=sa.size+sb.size-inter;
      pairs.push({a:g[i].at, b:g[j].at, 手数:g[i].p+'/'+g[j].p,
                  重なり:+(uni?inter/uni:0).toFixed(3)});
    }
  }
  pairs.sort((x,y)=>y.重なり-x.重なり);
  const bins={};
  pairs.forEach(p=>{ const k=(Math.floor(p.重なり*10)/10).toFixed(1); bins[k]=(bins[k]||0)+1; });
  console.log('\n同じ部屋の組 ' + pairs.length + '件。押し手の重なりの分布:');
  Object.keys(bins).sort((a,b)=>b-a).forEach(k=>console.log(`  ${k}台: ${bins[k]}組`));
  console.log('\n重なりが大きい順(上位30組):');
  pairs.slice(0,30).forEach(p=>console.log(`  第${p.a}面 と 第${p.b}面  重なり${p.重なり}  ${p.手数}手`));
  fs.writeFileSync(path.join(STOCK,'roomdup.json'), JSON.stringify(pairs,null,1));
  console.log('\ntools/stock/roomdup.json に書き出しました');
}else{
  console.log('まだ揃っていません。全担当を走らせてください');
}
