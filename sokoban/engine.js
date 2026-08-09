'use strict';
/* 倉庫番 自動生成エンジン (ページ本体と生成ワーカーの両方から読み込む)
   - 盤面の作り方を5種類から抽選(柱 / 部屋 / 棚 / 洞窟 / 広間)
   - 外周を欠けさせて長方形でない倉庫も作る
   - 置き場の配置も4種類から抽選(かたまり / ばらばら / 一列 / 隅)
   - 荷物の数も毎回ランダム */

function mulberry32(a){
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
const shuffle=(a,rng)=>{ for(let i=a.length-1;i>0;i--){const j=rng()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];} return a; };
const pick=(a,rng)=>a[rng()*a.length|0];
const randInt=(lo,hi,rng)=>lo+(rng()*(hi-lo+1)|0);

/* ================= 盤面(壁)の生成 ================= */
const idx=(w,x,y)=>y*w+x;

function blankGrid(W,H){
  const w=W+2, h=H+2;
  const grid=new Uint8Array(w*h).fill(1);
  for(let y=1;y<=H;y++) for(let x=1;x<=W;x++) grid[idx(w,x,y)]=0;
  return {grid,w,h,W,H};
}
function floorCells(grid){ const o=[]; for(let i=0;i<grid.length;i++) if(!grid[i]) o.push(i); return o; }

// 床が分断されたら、いちばん大きい島だけ残して他は壁で埋める
function keepLargestComponent(grid,w){
  const seen=new Uint8Array(grid.length);
  let best=null;
  for(let i=0;i<grid.length;i++){
    if(grid[i]||seen[i]) continue;
    const comp=[i]; seen[i]=1;
    for(let k=0;k<comp.length;k++){
      const c=comp[k];
      for(const d of [1,-1,w,-w]){ const q=c+d; if(!grid[q]&&!seen[q]){ seen[q]=1; comp.push(q); } }
    }
    if(!best||comp.length>best.length) best=comp;
  }
  if(!best) return 0;
  const keep=new Uint8Array(grid.length);
  for(const c of best) keep[c]=1;
  for(let i=0;i<grid.length;i++) if(!grid[i]&&!keep[i]) grid[i]=1;
  return best.length;
}

// 1) 柱: 開けた倉庫に柱と短い仕切りを散らす
function stylePillars(rng,W,H){
  const L=blankGrid(W,H), {grid,w}=L;
  const inner=floorCells(grid);
  shuffle(inner,rng);
  let quota=Math.round(W*H*(0.10+rng()*0.14));
  for(const i of inner){
    if(quota<=0) break;
    if(grid[i]) continue;
    const seg=[i];
    if(rng()<0.45){
      const d=pick([1,-1,w,-w],rng);
      if(grid[i+d]===0) seg.push(i+d);
      if(rng()<0.3 && grid[i+2*d]===0) seg.push(i+2*d);
    }
    for(const s of seg) grid[s]=1;
    quota-=seg.length;
  }
  return L;
}

// 2) 部屋: 仕切り壁で区切って、1マスの戸口でつなぐ
function styleRooms(rng,W,H){
  const L=blankGrid(W,H), {grid,w}=L;
  (function split(x0,y0,x1,y1,depth){
    const bw=x1-x0+1, bh=y1-y0+1;
    if(depth>2||(bw<6&&bh<6)) return;
    const vertical = bw===bh ? rng()<0.5 : bw>bh;
    if(vertical){
      if(bw<6) return;
      const x=randInt(x0+2,x1-2,rng);
      for(let y=y0;y<=y1;y++) grid[idx(w,x,y)]=1;
      const doors=1+(rng()<0.35?1:0);
      for(let k=0;k<doors;k++) grid[idx(w,x,randInt(y0,y1,rng))]=0;
      split(x0,y0,x-1,y1,depth+1); split(x+1,y0,x1,y1,depth+1);
    }else{
      if(bh<6) return;
      const y=randInt(y0+2,y1-2,rng);
      for(let x=x0;x<=x1;x++) grid[idx(w,x,y)]=1;
      const doors=1+(rng()<0.35?1:0);
      for(let k=0;k<doors;k++) grid[idx(w,randInt(x0,x1,rng),y)]=0;
      split(x0,y0,x1,y-1,depth+1); split(x0,y+1,x1,y1,depth+1);
    }
  })(1,1,W,H,0);
  return L;
}

// 3) 棚: 実際の倉庫のように、間隔を空けた長い棚を並べる
function styleAisles(rng,W,H){
  const L=blankGrid(W,H), {grid,w}=L;
  const horiz=rng()<0.5;
  const span=horiz?W:H, lanes=horiz?H:W;
  for(let k=2;k<=lanes;k+=2){
    if(rng()<0.2) continue;               // ときどき棚を抜いて通路を広げる
    const len=randInt(Math.max(2,span/3|0), span-2, rng);
    const off=randInt(1, span-len+1, rng);
    for(let t=0;t<len;t++){
      const p=off+t;
      const x=horiz?p:k, y=horiz?k:p;
      if(rng()<0.12) continue;            // 棚に隙間を作る
      grid[idx(w,x,y)]=1;
    }
  }
  return L;
}

// 4) 洞窟: 壁で埋めた状態から通路を掘る
function styleCave(rng,W,H){
  const w=W+2, h=H+2;
  const grid=new Uint8Array(w*h).fill(1);
  const target=Math.round(W*H*(0.45+rng()*0.2));
  let x=randInt(2,W-1,rng), y=randInt(2,H-1,rng), dug=0;
  const carve=(cx,cy)=>{
    if(cx<1||cy<1||cx>W||cy>H) return;
    if(grid[idx(w,cx,cy)]){ grid[idx(w,cx,cy)]=0; dug++; }
  };
  let guard=0;
  while(dug<target && guard++<20000){
    carve(x,y);
    if(rng()<0.25){                       // ときどき2x2に広げて箱を回せる場所を作る
      carve(x+1,y); carve(x,y+1); carve(x+1,y+1);
    }
    const d=pick([[1,0],[-1,0],[0,1],[0,-1]],rng);
    x=Math.min(W,Math.max(1,x+d[0]));
    y=Math.min(H,Math.max(1,y+d[1]));
  }
  return {grid,w,h,W,H};
}

// 5) 広間: ほぼ何もない広い床(荷物同士の絡みだけで解かせる)
function styleOpen(rng,W,H){
  const L=blankGrid(W,H), {grid}=L;
  const inner=floorCells(grid);
  shuffle(inner,rng);
  let quota=Math.round(W*H*(0.02+rng()*0.05));
  for(const i of inner){ if(quota--<=0) break; grid[i]=1; }
  return L;
}

const STYLES=[
  {name:'柱',   fn:stylePillars, weight:3},
  {name:'部屋', fn:styleRooms,   weight:2},
  {name:'棚',   fn:styleAisles,  weight:2},
  {name:'洞窟', fn:styleCave,    weight:2},
  {name:'広間', fn:styleOpen,    weight:1},
];
function pickStyle(rng){
  const total=STYLES.reduce((s,x)=>s+x.weight,0);
  let r=rng()*total;
  for(const s of STYLES){ r-=s.weight; if(r<0) return s; }
  return STYLES[0];
}

// 隅を欠けさせて、長方形でない倉庫にする
function biteCorners(L,rng){
  const {grid,w,W,H}=L;
  const bites=rng()<0.45 ? randInt(1,2,rng) : 0;
  for(let k=0;k<bites;k++){
    const bw=randInt(2,Math.max(2,W/3|0),rng), bh=randInt(2,Math.max(2,H/3|0),rng);
    const right=rng()<0.5, bottom=rng()<0.5;
    for(let dx=0;dx<bw;dx++) for(let dy=0;dy<bh;dy++){
      const x=right?W-dx:1+dx, y=bottom?H-dy:1+dy;
      grid[idx(w,x,y)]=1;
    }
  }
}

// 壁だけの行や列が外周に残らないよう、床の外接矩形＋壁1マスに切り詰める
function cropToFloors(L){
  const {grid,w}=L;
  let x0=1e9,y0=1e9,x1=-1,y1=-1;
  for(let i=0;i<grid.length;i++){
    if(grid[i]) continue;
    const x=i%w, y=(i/w)|0;
    if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
  }
  if(x1<0) return L;
  const W=x1-x0+1, H=y1-y0+1, nw=W+2, nh=H+2;
  const ng=new Uint8Array(nw*nh).fill(1);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) ng[(y+1)*nw+(x+1)]=grid[(y+y0)*w+(x+x0)];
  return {grid:ng, w:nw, h:nh, W, H, style:L.style, floors:L.floors};
}

function buildLayout(rng,W,H){
  const style=pickStyle(rng);
  const L=style.fn(rng,W,H);
  biteCorners(L,rng);
  L.style=style.name;
  L.floors=keepLargestComponent(L.grid,L.w);
  return cropToFloors(L);
}

/* ================= 探索用の共通コンテキスト ================= */
function makeCtx(layout){
  const size=layout.grid.length;
  return {
    grid:layout.grid, w:layout.w, size,
    boxMark:new Int32Array(size), boxGen:0,
    regMark:new Int32Array(size), regGen:0,
    queue:new Int32Array(size),
  };
}
function setBoxes(ctx, boxes){
  ctx.boxGen++;
  for(const b of boxes) ctx.boxMark[b]=ctx.boxGen;
}
const isBox=(ctx,c)=>ctx.boxMark[c]===ctx.boxGen;
function fillRegion(ctx, from){
  const {grid,w,regMark,queue}=ctx;
  const gen=++ctx.regGen;
  regMark[from]=gen;
  queue[0]=from;
  let head=0, tail=1, rep=from;
  while(head<tail){
    const c=queue[head++];
    if(c<rep) rep=c;
    for(const d of [1,-1,w,-w]){
      const q=c+d;
      if(grid[q]||isBox(ctx,q)||regMark[q]===gen) continue;
      regMark[q]=gen; queue[tail++]=q;
    }
  }
  return rep;
}
const inRegion=(ctx,c)=>ctx.regMark[c]===ctx.regGen;
function stateKey(boxes, rep){
  let s=String.fromCharCode(rep);
  for(let i=0;i<boxes.length;i++) s+=String.fromCharCode(boxes[i]);
  return s;
}

/* ================= 単純デッドロック ================= */
function aliveCells(grid,w,goals){
  const alive=new Uint8Array(grid.length);
  const q=goals.slice();
  for(const g of goals) alive[g]=1;
  while(q.length){
    const c=q.pop();
    for(const d of [1,-1,w,-w]){
      const p=c+d, back=c+2*d;
      if(grid[p]||grid[back]||alive[p]) continue;
      alive[p]=1; q.push(p);
    }
  }
  return alive;
}

/* ================= 逆生成 ================= */
function reverseSearch(ctx, layout, goals, opts, rng, hval){
  const {grid,w}=ctx;
  const dirs=[1,-1,w,-w];
  const goalSet=new Uint8Array(grid.length);
  for(const g of goals) goalSet[g]=1;
  const start=goals.slice().sort((a,b)=>a-b);
  const seen=new Set();
  const cands=[];
  let layer=[];
  setBoxes(ctx,start);
  const covered=new Uint8Array(grid.length);
  for(let c=0;c<grid.length;c++){
    if(grid[c]||isBox(ctx,c)||covered[c]) continue;
    const rep=fillRegion(ctx,c);
    for(let k=0;k<grid.length;k++) if(inRegion(ctx,k)) covered[k]=1;
    const key=stateKey(start,rep);
    if(seen.has(key)) continue;
    seen.add(key);
    layer.push({boxes:start, player:rep, depth:0, turns:0, lastBox:-1, lastDir:0, h:0});
  }
  let expanded=0;
  while(layer.length && expanded<opts.maxNodes && cands.length<opts.maxCands){
    const next=[];
    for(const st of layer){
      if(++expanded>=opts.maxNodes) break;
      if(st.depth>=opts.maxDepth) continue;
      setBoxes(ctx,st.boxes);
      fillRegion(ctx,st.player);
      const pulls=[];
      for(const b of st.boxes){
        for(const d of dirs){
          const p=b+d, q=b+2*d;
          if(grid[p]||isBox(ctx,p)) continue;
          if(grid[q]||isBox(ctx,q)) continue;
          if(!inRegion(ctx,p)) continue;
          pulls.push(b,d,p,q);
        }
      }
      for(let k=0;k<pulls.length;k+=4){
        const b=pulls[k], d=pulls[k+1], p=pulls[k+2], q=pulls[k+3];
        const boxes=st.boxes.slice();
        boxes[boxes.indexOf(b)]=p;
        boxes.sort((x,y)=>x-y);
        setBoxes(ctx,boxes);
        const rep=fillRegion(ctx,q);
        const key=stateKey(boxes,rep);
        if(seen.has(key)) continue;
        seen.add(key);
        const turns=st.turns+((st.lastBox===b&&st.lastDir===d)?0:1);
        const ns={boxes, player:rep, depth:st.depth+1, turns, lastBox:p, lastDir:d, h:hval(boxes)};
        next.push(ns);
        let onGoal=0;
        for(const x of boxes) if(goalSet[x]) onGoal++;
        if(onGoal===0 && ns.h>=opts.minH) cands.push(ns);
      }
    }
    if(next.length>opts.beam){
      next.sort((a,b)=>(b.h+b.turns*0.5)-(a.h+a.turns*0.5));
      const keep=Math.floor(opts.beam*0.6);
      layer=next.slice(0,keep).concat(shuffle(next.slice(keep),rng).slice(0,opts.beam-keep));
    }else{
      layer=next;
    }
  }
  return cands;
}

/* ================= 前向きソルバ (A*) ================= */
function makeSolver(ctx, layout, goals){
  const {grid,w}=ctx;
  const dirs=[1,-1,w,-w];
  const goalSet=new Uint8Array(grid.length);
  for(const g of goals) goalSet[g]=1;
  const alive=aliveCells(grid,w,goals);
  const gdist=goals.map(g=>{
    const dist=new Int32Array(grid.length).fill(-1);
    dist[g]=0;
    const q=[g];
    for(let i=0;i<q.length;i++){
      const c=q[i];
      for(const d of dirs){ const n=c+d; if(grid[n]||dist[n]>=0) continue; dist[n]=dist[c]+1; q.push(n); }
    }
    return dist;
  });
  // 箱とゴールの1対1割当の最小和(押し回数の下界)。荷物が増えるので分枝限定で解く
  const hcache=new Map();
  function assign(boxes){
    const n=boxes.length;
    const used=new Uint8Array(n);
    let best=Infinity;
    (function rec(i,sum){
      if(sum>=best) return;
      if(i===n){ best=sum; return; }
      for(let g=0;g<n;g++){
        if(used[g]) continue;
        const v=gdist[g][boxes[i]];
        if(v<0) continue;
        used[g]=1; rec(i+1,sum+v); used[g]=0;
      }
    })(0,0);
    return best;
  }
  function hval(boxes){
    const key=stateKey(boxes,0);
    const c=hcache.get(key);
    if(c!==undefined) return c;
    const v=assign(boxes);
    hcache.set(key,v);
    return v;
  }

  function frozen(b){
    for(const off of [0,-1,-w,-w-1]){
      const o=b+off;
      let boxCount=0, filled=true, allGoal=true;
      for(const c of [o,o+1,o+w,o+w+1]){
        if(grid[c]) continue;
        if(isBox(ctx,c)){ boxCount++; if(!goalSet[c]) allGoal=false; }
        else { filled=false; break; }
      }
      if(filled&&boxCount>0&&!allGoal) return true;
    }
    return false;
  }
  function isDead(boxes){
    setBoxes(ctx,boxes);
    for(const b of boxes){
      if(!alive[b]) return true;
      if(frozen(b)) return true;
    }
    return false;
  }

  function heapPush(h,node){
    h.push(node);
    let i=h.length-1;
    while(i>0){ const p=(i-1)>>1; if(h[p].f<=h[i].f) break; [h[p],h[i]]=[h[i],h[p]]; i=p; }
  }
  function heapPop(h){
    const top=h[0], last=h.pop();
    if(h.length){ h[0]=last; let i=0;
      for(;;){ const l=2*i+1, r=l+1; let m=i;
        if(l<h.length&&h[l].f<h[m].f) m=l;
        if(r<h.length&&h[r].f<h[m].f) m=r;
        if(m===i) break; [h[m],h[i]]=[h[i],h[m]]; i=m; }
    }
    return top;
  }

  function solve(boxes0, player, limitNodes){
    const start=boxes0.slice().sort((a,b)=>a-b);
    if(start.every(b=>goalSet[b])) return {pushes:0, lines:0, moves:[]};
    const h0=hval(start);
    if(h0===Infinity) return null;
    setBoxes(ctx,start);
    const rep0=fillRegion(ctx,player);
    const k0=stateKey(start,rep0);
    const open=[]; heapPush(open,{boxes:start, player:rep0, g:0, f:h0, key:k0, prev:null, move:null});
    const best=new Map([[k0,0]]);
    const closed=new Set();
    let nodes=0;
    while(open.length){
      const cur=heapPop(open);
      if(closed.has(cur.key)) continue;
      closed.add(cur.key);
      if(++nodes>limitNodes) return null;
      if(cur.boxes.every(b=>goalSet[b])){
        const moves=[]; let n=cur;
        while(n.move){ moves.unshift(n.move); n=n.prev; }
        let lines=0, lb=-1, ld=0;
        for(const m of moves){ if(m.from!==lb||m.dir!==ld) lines++; lb=m.to; ld=m.dir; }
        return {pushes:moves.length, lines, moves};
      }
      setBoxes(ctx,cur.boxes);
      fillRegion(ctx,cur.player);
      const cands=[];
      for(const b of cur.boxes){
        for(const d of dirs){
          const from=b-d, to=b+d;
          if(grid[from]||isBox(ctx,from)) continue;
          if(grid[to]||isBox(ctx,to)) continue;
          if(!inRegion(ctx,from)) continue;
          if(!alive[to]) continue;
          cands.push(b,d,to);
        }
      }
      const g=cur.g+1;
      for(let k=0;k<cands.length;k+=3){
        const b=cands[k], d=cands[k+1], to=cands[k+2];
        const boxes=cur.boxes.slice();
        boxes[boxes.indexOf(b)]=to;
        boxes.sort((x,y)=>x-y);
        const hh=hval(boxes);
        if(hh===Infinity) continue;
        setBoxes(ctx,boxes);
        if(frozen(to)) continue;
        const rep=fillRegion(ctx,b);
        const key=stateKey(boxes,rep);
        if(best.has(key)&&best.get(key)<=g) continue;
        best.set(key,g);
        heapPush(open,{boxes, player:rep, g, f:g+hh, key, prev:cur, move:{from:b, to, dir:d}});
      }
    }
    return null;
  }
  return {solve, alive, hval, isDead};
}

/* ================= 置き場の配置 ================= */
function goalsCluster(layout,floors,count,rng){   // 一箇所にまとめた置き場
  const {grid,w}=layout;
  const anchor=pick(floors,rng);
  const order=bfsOrder(grid,w,anchor);
  const pool=order.slice(0,Math.max(count+2,count*3));
  return pool.length>=count ? shuffle(pool,rng).slice(0,count) : null;
}
function goalsScatter(layout,floors,count,rng){   // 離れた場所にばらばら
  const {grid,w}=layout;
  const shuffled=shuffle(floors.slice(),rng);
  const out=[];
  for(const c of shuffled){
    if(out.every(o=>manhattan(w,o,c)>=3)) out.push(c);
    if(out.length===count) return out;
  }
  return out.length===count?out:null;
}
function goalsLine(layout,floors,count,rng){      // 一列に並んだ置き場
  const {grid,w,W,H}=layout;
  const horiz=rng()<0.5;
  const lanes=shuffle([...Array(horiz?H:W).keys()].map(k=>k+1),rng);
  for(const k of lanes){
    const run=[];
    for(let p=1;p<=(horiz?W:H);p++){
      const c=horiz?idx(w,p,k):idx(w,k,p);
      if(grid[c]){ run.length=0; continue; }
      run.push(c);
      if(run.length===count) return run.slice();
    }
  }
  return null;
}
function goalsCorner(layout,floors,count,rng){    // 倉庫の隅に寄せた置き場
  const {grid,w,W,H}=layout;
  const cx=rng()<0.5?1:W, cy=rng()<0.5?1:H;
  const target=idx(w,cx,cy);
  const near=floors.slice().sort((a,b)=>manhattan(w,a,target)-manhattan(w,b,target));
  const pool=near.slice(0,Math.max(count+2,count*3));
  return pool.length>=count ? shuffle(pool,rng).slice(0,count) : null;
}
function bfsOrder(grid,w,from){
  const order=[from];
  const seen=new Uint8Array(grid.length); seen[from]=1;
  for(let i=0;i<order.length;i++){
    const c=order[i];
    for(const d of [1,-1,w,-w]){ const n=c+d; if(grid[n]||seen[n]) continue; seen[n]=1; order.push(n); }
  }
  return order;
}
const manhattan=(w,a,b)=>Math.abs(a%w-b%w)+Math.abs((a/w|0)-(b/w|0));

const GOAL_STYLES=[
  {name:'かたまり', fn:goalsCluster, weight:3},
  {name:'ばらばら', fn:goalsScatter, weight:2},
  {name:'一列',     fn:goalsLine,    weight:2},
  {name:'隅',       fn:goalsCorner,  weight:2},
];
function pickGoals(layout,floors,count,rng){
  const total=GOAL_STYLES.reduce((s,x)=>s+x.weight,0);
  let r=rng()*total, chosen=GOAL_STYLES[0];
  for(const s of GOAL_STYLES){ r-=s.weight; if(r<0){ chosen=s; break; } }
  const g=chosen.fn(layout,floors,count,rng);
  return g ? {goals:g.sort((a,b)=>a-b), style:chosen.name} : null;
}

/* ================= 生成本体 ================= */
// budgetMs を超えたら、その時点で見つかっている最良の盤面を返す。
// (逆生成で作っているので、条件を満たしきれなくても必ず解ける盤面ではある)
function generate(seed, cfg, budgetMs){
  const rng=mulberry32(seed);
  const deadline=(budgetMs||cfg.budget)?Date.now()+(budgetMs||cfg.budget):Infinity;
  let fallback=null;
  for(let attempt=0; attempt<cfg.tries; attempt++){
    if(fallback&&Date.now()>deadline) break;
    // 荷物の数は毎回抽選。多いほど要求手数も引き上げる
    const nbox=randInt(cfg.minBoxes,cfg.maxBoxes,rng);
    const minPush=Math.round(cfg.pushBase+cfg.pushPerBox*nbox);
    const minLines=Math.round(minPush*cfg.lineRatio);
    const W=randInt(cfg.W[0],cfg.W[1],rng), H=randInt(cfg.H[0],cfg.H[1],rng);
    const layout=buildLayout(rng,W,H);
    if(layout.floors<nbox*4+8) continue;
    const ctx=makeCtx(layout);
    const floors=floorCells(layout.grid);
    const gp=pickGoals(layout,floors,nbox,rng);
    if(!gp) continue;
    const goals=gp.goals;
    const solver=makeSolver(ctx,layout,goals);
    const cands=reverseSearch(ctx,layout,goals,{
      maxNodes:cfg.maxNodes, maxDepth:cfg.maxDepth,
      minH:minPush, beam:cfg.beam, maxCands:cfg.maxCands
    },rng,solver.hval);
    if(!cands.length) continue;
    cands.sort((a,b)=>(b.h*2+b.turns)-(a.h*2+a.turns));
    for(const c of cands.slice(0,cfg.candidates)){
      if(fallback&&Date.now()>deadline) break;
      const sol=solver.solve(c.boxes,c.player,cfg.solveNodes);
      if(!sol) continue;
      const puzzle={
        grid:layout.grid, w:layout.w, h:layout.h, W:layout.W, H:layout.H,
        boxes:c.boxes, goals, player:c.player,
        pushes:sol.pushes, lines:sol.lines,
        style:layout.style, goalStyle:gp.style, nbox
      };
      if(sol.pushes>=minPush&&sol.lines>=minLines) return puzzle;
      if(!fallback||sol.pushes*2+sol.lines>fallback.pushes*2+fallback.lines) fallback=puzzle;
    }
  }
  return fallback;
}

function render(p){
  const {grid,w,h}=p;
  const bs=new Set(p.boxes), gs=new Set(p.goals);
  let out='';
  for(let y=0;y<h;y++){
    let line='';
    for(let x=0;x<w;x++){
      const i=y*w+x;
      line+= grid[i]?'#': bs.has(i)?(gs.has(i)?'*':'$'): i===p.player?(gs.has(i)?'+':'@'): gs.has(i)?'.':' ';
    }
    out+=line.replace(/\s+$/,'')+'\n';
  }
  return out;
}

const DIFF={
  easy:  {W:[6,7],H:[6,7],minBoxes:2,maxBoxes:3,pushBase:3,pushPerBox:3,lineRatio:0.55,budget:4000,
          tries:60,candidates:6,beam:120,maxCands:300,maxNodes:15000,maxDepth:26,solveNodes:30000},
  normal:{W:[7,8],H:[7,8],minBoxes:3,maxBoxes:4,pushBase:4,pushPerBox:4,lineRatio:0.58,budget:6000,
          tries:60,candidates:8,beam:150,maxCands:400,maxNodes:25000,maxDepth:34,solveNodes:60000},
  hard:  {W:[8,9],H:[8,9],minBoxes:4,maxBoxes:6,pushBase:4,pushPerBox:5,lineRatio:0.6,budget:9000,
          tries:80,candidates:8,beam:200,maxCands:500,maxNodes:40000,maxDepth:44,solveNodes:120000},
};

/* ================= 外部に公開 ================= */
// ページからも Worker からも同じファイルを読み込む
(function(root){
  root.SokobanEngine={generate, DIFF, makeCtx, makeSolver, mulberry32};
})(typeof self!=='undefined'?self:this);
