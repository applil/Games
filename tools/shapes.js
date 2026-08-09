'use strict';
/* 盤面の形・置き場の配置・初期配置の「型」をそろえたモジュール。
 *
 * ランダムに壁を撒くだけだと、どれも「まだらな部屋」にしかならない。
 * ここでは倉庫の形そのものを型として持ち、
 *   ・形     : 空洞 / 回廊 / 迷路 / L字 / U字 / 十字 / ドーナツ / 2部屋 / 3部屋 …
 *   ・置き場 : かたまり(密) / かたまり(疎) / 一列 / ばらばら / 中央 / 壁際 / 角 / 通路上
 *   ・初期配置: 近い / 遠い / 混在 / 動かしにくい位置
 * をそれぞれ独立に抽選することで、面の見た目と手触りを散らす。
 */

const idx=(w,x,y)=>y*w+x;
const randInt=(lo,hi,rng)=>lo+(rng()*(hi-lo+1)|0);
const pick=(a,rng)=>a[rng()*a.length|0];
const shuffle=(a,rng)=>{ for(let i=a.length-1;i>0;i--){const j=rng()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];} return a; };

/* ================= 下ごしらえ ================= */
function blank(W,H,fill){
  const w=W+2, h=H+2;
  const grid=new Uint8Array(w*h).fill(1);
  if(!fill) for(let y=1;y<=H;y++) for(let x=1;x<=W;x++) grid[idx(w,x,y)]=0;
  return {grid,w,h,W,H};
}
const fillRect=(L,x0,y0,x1,y1,v)=>{
  for(let y=Math.max(1,y0);y<=Math.min(L.H,y1);y++)
    for(let x=Math.max(1,x0);x<=Math.min(L.W,x1);x++) L.grid[idx(L.w,x,y)]=v;
};
function floorCount(L){ let n=0; for(let i=0;i<L.grid.length;i++) if(!L.grid[i]) n++; return n; }

// 床が分断されていたら、いちばん大きい島だけ残す
function keepLargest(L){
  const {grid,w}=L;
  const seen=new Uint8Array(grid.length);
  let best=null;
  for(let i=0;i<grid.length;i++){
    if(grid[i]||seen[i]) continue;
    const comp=[i]; seen[i]=1;
    for(let k=0;k<comp.length;k++){
      const c=comp[k];
      for(const d of [1,-1,w,-w]){ const q=c+d; if(q>=0&&q<grid.length&&!grid[q]&&!seen[q]){ seen[q]=1; comp.push(q); } }
    }
    if(!best||comp.length>best.length) best=comp;
  }
  if(!best) return false;
  const keep=new Uint8Array(grid.length);
  for(const c of best) keep[c]=1;
  for(let i=0;i<grid.length;i++) if(!grid[i]&&!keep[i]) grid[i]=1;
  return true;
}
// 壁だけの行や列が外周に残らないよう切り詰める
function crop(L){
  const {grid,w}=L;
  let x0=1e9,y0=1e9,x1=-1,y1=-1;
  for(let i=0;i<grid.length;i++){
    if(grid[i]) continue;
    const x=i%w, y=(i/w)|0;
    if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
  }
  if(x1<0) return null;
  const W=x1-x0+1, H=y1-y0+1, nw=W+2, nh=H+2;
  const ng=new Uint8Array(nw*nh).fill(1);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) ng[(y+1)*nw+(x+1)]=grid[(y+y0)*w+(x+x0)];
  return {grid:ng, w:nw, h:nh, W, H, shape:L.shape, clutter:L.clutter};
}

/* ================= 形の型 ================= */
// 各型は W×H の内側に壁を置く。min は成立に必要な最小サイズ。

// 空洞: 何もない広い床。柱がせいぜい1〜2本
const shapeOpen={ name:'空洞', min:[3,3], build(rng,W,H){
  const L=blank(W,H);
  const n=rng()<0.5?0:randInt(1,2,rng);
  for(let k=0;k<n;k++) L.grid[idx(L.w,randInt(2,W-1,rng),randInt(2,H-1,rng))]=1;
  return L;
}};

// 柱: 柱と短い仕切りが散らばる倉庫
const shapePillars={ name:'柱', min:[4,4], build(rng,W,H){
  const L=blank(W,H);
  let quota=Math.round(W*H*(0.12+rng()*0.14));
  const cells=[];
  for(let y=1;y<=H;y++) for(let x=1;x<=W;x++) cells.push([x,y]);
  shuffle(cells,rng);
  for(const [x,y] of cells){
    if(quota<=0) break;
    if(L.grid[idx(L.w,x,y)]) continue;
    L.grid[idx(L.w,x,y)]=1; quota--;
    if(rng()<0.4){                        // ときどき2マス続きの仕切りにする
      const [dx,dy]=pick([[1,0],[0,1],[-1,0],[0,-1]],rng);
      if(x+dx>=1&&x+dx<=W&&y+dy>=1&&y+dy<=H){ L.grid[idx(L.w,x+dx,y+dy)]=1; quota--; }
    }
  }
  return L;
}};

// ドーナツ: 中央に壁の島があり、周りを回れる
const shapeDonut={ name:'ドーナツ', min:[5,5], build(rng,W,H){
  const L=blank(W,H);
  const iw=Math.max(1,Math.round(W*(0.3+rng()*0.3)));
  const ih=Math.max(1,Math.round(H*(0.3+rng()*0.3)));
  const x0=randInt(2, Math.max(2, W-iw), rng);
  const y0=randInt(2, Math.max(2, H-ih), rng);
  fillRect(L, x0, y0, Math.min(W-1,x0+iw-1), Math.min(H-1,y0+ih-1), 1);
  return L;
}};

// L字: 角をひとつ大きく欠く
const shapeL={ name:'L字', min:[4,4], build(rng,W,H){
  const L=blank(W,H);
  const cw=randInt(Math.max(1,(W/3)|0), Math.max(1,(W*2/3)|0), rng);
  const ch=randInt(Math.max(1,(H/3)|0), Math.max(1,(H*2/3)|0), rng);
  const right=rng()<0.5, bottom=rng()<0.5;
  fillRect(L, right?W-cw+1:1, bottom?H-ch+1:1, right?W:cw, bottom?H:ch, 1);
  return L;
}};

// U字: 一辺の真ん中を大きく欠く
const shapeU={ name:'U字', min:[5,4], build(rng,W,H){
  const L=blank(W,H);
  const vertical=rng()<0.5;
  if(vertical){
    const cw=Math.max(1,Math.round(W*(0.3+rng()*0.25)));
    const ch=Math.max(1,Math.round(H*(0.45+rng()*0.3)));
    const x0=Math.max(2,Math.round((W-cw)/2)+1);
    const fromTop=rng()<0.5;
    fillRect(L, x0, fromTop?1:H-ch+1, x0+cw-1, fromTop?ch:H, 1);
  }else{
    const ch=Math.max(1,Math.round(H*(0.3+rng()*0.25)));
    const cw=Math.max(1,Math.round(W*(0.45+rng()*0.3)));
    const y0=Math.max(2,Math.round((H-ch)/2)+1);
    const fromLeft=rng()<0.5;
    fillRect(L, fromLeft?1:W-cw+1, y0, fromLeft?cw:W, y0+ch-1, 1);
  }
  return L;
}};

// 十字: 縦横の帯だけを残す
const shapeCross={ name:'十字・T字', min:[5,5], build(rng,W,H){
  const L=blank(W,H,true);            // いったん全部壁
  const bw=randInt(2, Math.max(2,(W/2)|0), rng);
  const bh=randInt(2, Math.max(2,(H/2)|0), rng);
  const cx=randInt(1, Math.max(1,W-bw+1), rng);
  const cy=randInt(1, Math.max(1,H-bh+1), rng);
  fillRect(L, cx, 1, cx+bw-1, H, 0);   // 縦帯
  fillRect(L, 1, cy, W, cy+bh-1, 0);   // 横帯
  return L;
}};

// 回廊: 幅1〜2のうねった通路
const shapeCorridor={ name:'回廊', min:[4,4], build(rng,W,H){
  const L=blank(W,H,true);
  const width=rng()<0.35?2:1;
  let x=randInt(1,W,rng), y=randInt(1,H,rng);
  const target=Math.round(W*H*(0.35+rng()*0.2));
  let dug=0, guard=0;
  const carve=(cx,cy)=>{
    for(let dx=0;dx<width;dx++) for(let dy=0;dy<width;dy++){
      const px=cx+dx, py=cy+dy;
      if(px<1||py<1||px>W||py>H) continue;
      if(L.grid[idx(L.w,px,py)]){ L.grid[idx(L.w,px,py)]=0; dug++; }
    }
  };
  let dir=pick([[1,0],[-1,0],[0,1],[0,-1]],rng);
  while(dug<target && guard++<4000){
    carve(x,y);
    if(rng()<0.3) dir=pick([[1,0],[-1,0],[0,1],[0,-1]],rng);   // ときどき曲がる
    const nx=x+dir[0], ny=y+dir[1];
    if(nx<1||ny<1||nx>W||ny>H){ dir=pick([[1,0],[-1,0],[0,1],[0,-1]],rng); continue; }
    x=nx; y=ny;
  }
  return L;
}};

// 迷路: 一マス幅の通路を掘って行き止まりを作る
const shapeMaze={ name:'迷路', min:[5,5], build(rng,W,H){
  const L=blank(W,H,true);
  // 奇数座標を部屋、その間を壁として掘り進む(棒倒しではなく穴掘り法)
  const sx=1+2*((rng()*Math.ceil(W/2))|0), sy=1+2*((rng()*Math.ceil(H/2))|0);
  const stack=[[Math.min(sx,W),Math.min(sy,H)]];
  L.grid[idx(L.w,stack[0][0],stack[0][1])]=0;
  while(stack.length){
    const [x,y]=stack[stack.length-1];
    const dirs=shuffle([[2,0],[-2,0],[0,2],[0,-2]],rng);
    let moved=false;
    for(const [dx,dy] of dirs){
      const nx=x+dx, ny=y+dy;
      if(nx<1||ny<1||nx>W||ny>H) continue;
      if(!L.grid[idx(L.w,nx,ny)]) continue;
      L.grid[idx(L.w,x+dx/2,y+dy/2)]=0;
      L.grid[idx(L.w,nx,ny)]=0;
      stack.push([nx,ny]);
      moved=true;
      break;
    }
    if(!moved) stack.pop();
  }
  // このままでは荷物を回せないので、数カ所だけ広げる
  const widen=randInt(1,3,rng);
  for(let k=0;k<widen;k++){
    const x=randInt(1,Math.max(1,W-1),rng), y=randInt(1,Math.max(1,H-1),rng);
    fillRect(L,x,y,x+1,y+1,0);
  }
  return L;
}};

// 2部屋: 部屋ふたつを1本の道でつなぐ
const shapeTwoRooms={ name:'2部屋', min:[5,4], build(rng,W,H){
  const L=blank(W,H,true);
  const vertical=rng()<0.5;
  if(vertical){
    const split=randInt(3, Math.max(3,W-2), rng);
    fillRect(L, 1, 1, split-2, H, 0);
    fillRect(L, split+1, 1, W, H, 0);
    const doorY=randInt(1,H,rng);
    fillRect(L, split-1, doorY, split, doorY, 0);      // つなぐ道
  }else{
    const split=randInt(3, Math.max(3,H-2), rng);
    fillRect(L, 1, 1, W, split-2, 0);
    fillRect(L, 1, split+1, W, H, 0);
    const doorX=randInt(1,W,rng);
    fillRect(L, doorX, split-1, doorX, split, 0);
  }
  return L;
}};

// 3部屋: 部屋を3つ、細い道でつなぐ
const shapeThreeRooms={ name:'3部屋', min:[6,5], build(rng,W,H){
  const L=blank(W,H,true);
  const horiz=rng()<0.5;
  if(horiz){
    const a=Math.max(2,Math.round(W*0.3)), b=Math.max(2,Math.round(W*0.66));
    fillRect(L,1,1,a-1,H,0);
    fillRect(L,a+1,1,b-1,H,0);
    fillRect(L,b+1,1,W,H,0);
    const y1=randInt(1,H,rng), y2=randInt(1,H,rng);
    L.grid[idx(L.w,a,y1)]=0;
    L.grid[idx(L.w,b,y2)]=0;
  }else{
    const a=Math.max(2,Math.round(H*0.3)), b=Math.max(2,Math.round(H*0.66));
    fillRect(L,1,1,W,a-1,0);
    fillRect(L,1,a+1,W,b-1,0);
    fillRect(L,1,b+1,W,H,0);
    const x1=randInt(1,W,rng), x2=randInt(1,W,rng);
    L.grid[idx(L.w,x1,a)]=0;
    L.grid[idx(L.w,x2,b)]=0;
  }
  return L;
}};

// まだら: 完全ランダムに壁を撒く(これまでの方式)
const shapeRagged={ name:'まだら', min:[3,3], build(rng,W,H){
  const L=blank(W,H);
  const ratio=0.05+rng()*0.28;
  for(let y=1;y<=H;y++) for(let x=1;x<=W;x++)
    if(rng()<ratio) L.grid[idx(L.w,x,y)]=1;
  return L;
}};

const SHAPES=[shapeOpen, shapePillars, shapeDonut, shapeL, shapeU, shapeCross,
              shapeCorridor, shapeMaze, shapeTwoRooms, shapeThreeRooms, shapeRagged];

/* ================= 仕切りの密度 ================= */
// 形とは別に「中がごちゃついているか、がらんとしているか」を振る。
// 同じL字でも、仕切りが多いと動きにくく、無いと開放的に見える。
const CLUTTERS=[
  {name:'がらんどう', ratio:0},
  {name:'ふつう',     ratio:0.08},
  {name:'仕切り多め', ratio:0.18},
];
function addClutter(L, rng){
  const c=pick(CLUTTERS,rng);
  L.clutter=c.name;
  if(!c.ratio) return L;
  const cells=[];
  for(let y=1;y<=L.H;y++) for(let x=1;x<=L.W;x++) if(!L.grid[idx(L.w,x,y)]) cells.push([x,y]);
  shuffle(cells,rng);
  let quota=Math.round(cells.length*c.ratio);
  for(const [x,y] of cells){
    if(quota<=0) break;
    L.grid[idx(L.w,x,y)]=1;
    quota--;
    if(rng()<0.35){                       // ときどき2マス続きの仕切りにする
      const [dx,dy]=pick([[1,0],[0,1],[-1,0],[0,-1]],rng);
      const nx=x+dx, ny=y+dy;
      if(nx>=1&&nx<=L.W&&ny>=1&&ny<=L.H&&!L.grid[idx(L.w,nx,ny)]){ L.grid[idx(L.w,nx,ny)]=1; quota--; }
    }
  }
  return L;
}

/* ================= 大きさと縦横比 ================= */
// 小/中/大 × 縦長/正方/横長 を独立に振る
const SIZE_RANGE={'小':[3,4], '中':[5,6], '大':[6,7], '特大':[8,8]};
function pickSize(rng, minW, minH){
  // その形が成立する大きさの中から選ぶ。
  // (先に大きさを引くと、大きい盤でしか作れない形に引っぱられて大ばかりになる)
  const ok=Object.keys(SIZE_RANGE).filter(k=>SIZE_RANGE[k][1]>=(minW||0)&&SIZE_RANGE[k][1]>=(minH||0));
  // 特大は全状態の列挙が重くなるので出現を抑える
  const weighted=[];
  for(const k of (ok.length?ok:['大'])) for(let n=0;n<(k==='特大'?1:3);n++) weighted.push(k);
  const size=pick(weighted,rng);
  const aspect=pick(['縦長','正方','横長'],rng);
  const base=SIZE_RANGE[size];
  let W=randInt(base[0],base[1],rng), H=randInt(base[0],base[1],rng);
  if(aspect==='縦長') W=Math.max(3,W-1);
  if(aspect==='横長') H=Math.max(3,H-1);
  return {W:Math.max(W,minW||0), H:Math.max(H,minH||0), size, aspect};
}

// 形をひとつ作る。成立しなければ null
// 形を先に選んでから、その形が成立する大きさを引く。
// (先に大きさを引くと、小さい盤でも作れる「空洞」「まだら」ばかりになる)
function buildShape(rng, opts){
  const shape=pick(SHAPES,rng);
  const {W,H,size,aspect}=pickSize(rng, shape.min[0], shape.min[1]);
  const L=shape.build(rng,W,H);
  L.shape=shape.name;
  addClutter(L, rng);
  if(!keepLargest(L)) return null;
  const out=crop(L);
  if(!out) return null;
  out.size=size; out.aspect=aspect; out.clutter=L.clutter;
  out.floors=floorCount(out);
  return out;
}

/* ================= 置き場の型 ================= */
const bfsOrder=(grid,w,from)=>{
  const order=[from];
  const seen=new Uint8Array(grid.length); seen[from]=1;
  for(let i=0;i<order.length;i++){
    const c=order[i];
    for(const d of [1,-1,w,-w]){ const n=c+d; if(n<0||n>=grid.length||grid[n]||seen[n]) continue; seen[n]=1; order.push(n); }
  }
  return order;
};
const manhattan=(w,a,b)=>Math.abs(a%w-b%w)+Math.abs((a/w|0)-(b/w|0));
// そのマスが何方向に開いているか(4=部屋の中央 / 少ない=壁際や通路)
const openness=(grid,w,c)=>[1,-1,w,-w].filter(d=>!grid[c+d]).length;

const GOAL_PATTERNS=[
  { name:'密集', pick(L,floors,n,rng){          // 隙間なくかたまっている
      const anchor=pick(floors,rng);
      const near=bfsOrder(L.grid,L.w,anchor).slice(0,n);
      return near.length===n?near:null;
    }},
  { name:'疎な塊', pick(L,floors,n,rng){        // 近いが少し間が空く
      const anchor=pick(floors,rng);
      const near=bfsOrder(L.grid,L.w,anchor).slice(0,Math.min(floors.length,n*4));
      return near.length>=n?shuffle(near,rng).slice(0,n):null;
    }},
  { name:'ばらばら', pick(L,floors,n,rng){      // 互いに離す
      const out=[];
      for(const c of shuffle(floors.slice(),rng)){
        if(out.every(o=>manhattan(L.w,o,c)>=4)) out.push(c);
        if(out.length===n) return out;
      }
      return null;
    }},
  { name:'一列', pick(L,floors,n,rng){          // 縦か横に並ぶ
      const horiz=rng()<0.5;
      const lanes=shuffle([...Array(horiz?L.H:L.W).keys()].map(k=>k+1),rng);
      for(const k of lanes){
        const run=[];
        for(let p=1;p<=(horiz?L.W:L.H);p++){
          const c=horiz?idx(L.w,p,k):idx(L.w,k,p);
          if(L.grid[c]){ run.length=0; continue; }
          run.push(c);
          if(run.length===n) return run.slice();
        }
      }
      return null;
    }},
  { name:'中央', pick(L,floors,n,rng){          // 部屋の真ん中(四方が開いたマス)
      const open=floors.filter(c=>openness(L.grid,L.w,c)>=3);
      return open.length>=n?shuffle(open,rng).slice(0,n):null;
    }},
  { name:'壁際', pick(L,floors,n,rng){          // 壁に接するマス
      const edge=floors.filter(c=>openness(L.grid,L.w,c)===3);
      return edge.length>=n?shuffle(edge,rng).slice(0,n):null;
    }},
  { name:'角', pick(L,floors,n,rng){            // 二方向が壁のマス
      const corner=floors.filter(c=>openness(L.grid,L.w,c)<=2);
      return corner.length>=n?shuffle(corner,rng).slice(0,n):null;
    }},
  { name:'通路上', pick(L,floors,n,rng){        // 一直線の通路の途中
      const mid=floors.filter(c=>{
        const g=L.grid, w=L.w;
        const horiz=!g[c-1]&&!g[c+1]&&g[c-w]&&g[c+w];
        const vert =!g[c-w]&&!g[c+w]&&g[c-1]&&g[c+1];
        return horiz||vert;
      });
      return mid.length>=n?shuffle(mid,rng).slice(0,n):null;
    }},
];

function pickGoals(L, floors, n, rng){
  const order=shuffle(GOAL_PATTERNS.slice(),rng);
  for(const pat of order){
    const g=pat.pick(L,floors,n,rng);
    if(g&&new Set(g).size===n) return {goals:g.slice().sort((a,b)=>a-b), pattern:pat.name};
  }
  return null;
}

/* ================= 初期配置の型 ================= */
// 解ける状態の表から、狙った性格の初期配置を選ぶ。
// dist は「状態キー → 残り最短手数」の完全な表。
const START_PATTERNS=['近い','遠い','混在','動かしにくい'];

// 荷物ごとの「ゴールまでの距離」と「押せる方向の数」から性格を測る
function startProfile(L, goals, boxes){
  const {grid,w}=L;
  const near=new Int32Array(grid.length).fill(-1);
  const q=goals.slice();
  for(const g of goals) near[g]=0;
  for(let i=0;i<q.length;i++){
    const c=q[i];
    for(const d of [1,-1,w,-w]){ const nq=c+d; if(nq<0||nq>=grid.length||grid[nq]||near[nq]>=0) continue; near[nq]=near[c]+1; q.push(nq); }
  }
  const dists=boxes.map(b=>near[b]<0?99:near[b]);
  const avg=dists.reduce((a,b)=>a+b,0)/dists.length;
  const spread=Math.max(...dists)-Math.min(...dists);
  // 押せる方向の数(向かい合う2マスが両方空いている方向の数)
  const mobility=boxes.map(b=>
    [[1,-1],[w,-w]].filter(([d1,d2])=>!grid[b+d1]&&!grid[b+d2]).length
  ).reduce((a,b)=>a+b,0)/boxes.length;
  return {avg, spread, mobility};
}
function matchesStart(pattern, prof, maxDist){
  const far=maxDist*0.42;
  switch(pattern){
    case '近い':         return prof.avg<=Math.max(2,maxDist*0.35);
    case '遠い':         return prof.avg>=far;   // far は呼び出し側で決めた閾値
    case '混在':         return prof.spread>=Math.max(3,maxDist*0.4);
    case '動かしにくい': return prof.mobility<=1.2;
    default: return true;
  }
}

/* ================= 人の初期配置の型 ================= */
// 人がどこに立っているかで、初手の見え方が変わる。
//   広い場所   : 見晴らしがよく、どこからでも取りかかれる
//   荷物のそば : 荷物に囲まれていて、最初の一手が窮屈
//   通路の途中 : 一直線の通路上にいる
//   初手が一択 : 詰まない手が1つしかない(すぐ論理的にばれる)
//   初手が多彩 : 詰まない手が4つ以上あり、どれから手をつけるか迷う
const PLAYER_PATTERNS=['広い場所','荷物のそば','通路の途中','初手が一択','初手が多彩'];

function playerProfile(L, boxes, player, legalMoves, aliveMoves){
  const {grid,w}=L;
  const open=openness(grid,w,player);
  const boxesNear=boxes.filter(b=>manhattan(w,b,player)<=2).length;
  const horiz=!grid[player-1]&&!grid[player+1]&&grid[player-w]&&grid[player+w];
  const vert =!grid[player-w]&&!grid[player+w]&&grid[player-1]&&grid[player+1];
  return {open, boxesNear, inCorridor:horiz||vert, legalMoves, aliveMoves};
}
function matchesPlayer(pattern, prof){
  switch(pattern){
    case '広い場所':   return prof.open>=3 && prof.boxesNear===0;
    case '荷物のそば': return prof.boxesNear>=2;
    case '通路の途中': return prof.inCorridor;
    case '初手が一択': return prof.aliveMoves===1 && prof.legalMoves>=3;
    case '初手が多彩': return prof.aliveMoves>=4;
    default: return true;
  }
}

module.exports={
  SHAPES, GOAL_PATTERNS, START_PATTERNS, PLAYER_PATTERNS, CLUTTERS,
  buildShape, pickSize, pickGoals, startProfile, matchesStart,
  playerProfile, matchesPlayer,
  keepLargest, crop, floorCount, bfsOrder, openness, manhattan,
};
