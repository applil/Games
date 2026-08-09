'use strict';
/* 倉庫パズル 自動生成エンジン v3 — 「ひらめき」重視 / 小さい盤 / 完全ランダム配置
 *
 * 方針:
 *   1. 壁も置き場も完全にランダムに置く(意図した構造を作らない)
 *   2. その盤面の【全状態】を列挙し、解ける状態の集合を厳密に求める
 *      (完成状態から「引き」で全探索する = ビームなしの完全な逆到達解析)
 *   3. ランダムな配置が解けるかは、この集合に入っているかどうかで確定する
 *   4. 解ける配置の中から「難しい」ものを選ぶ。難しさは手数ではなく
 *      ・罠率      : 打てる手のうち、指した瞬間に詰む手の割合
 *      ・一本道    : 正解が1手しかない場面の数
 *      ・逆行      : 置き場から荷物を一度どける / 置き場から遠ざける手が必要か
 *      で測る。これらは全状態が分かっているので厳密に計算できる。
 */

function mulberry32(a){
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
const shuffle=(a,rng)=>{ for(let i=a.length-1;i>0;i--){const j=rng()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];} return a; };
const randInt=(lo,hi,rng)=>lo+(rng()*(hi-lo+1)|0);

/* ================= 盤面: 完全ランダム ================= */
function randomLayout(rng,W,H,wallRatio){
  const w=W+2, h=H+2;
  const grid=new Uint8Array(w*h).fill(1);
  for(let y=1;y<=H;y++) for(let x=1;x<=W;x++){
    grid[y*w+x] = rng()<wallRatio ? 1 : 0;
  }
  // 床が分断されたら、いちばん大きい島だけ残す
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
  if(!best) return null;
  const keep=new Uint8Array(grid.length);
  for(const c of best) keep[c]=1;
  for(let i=0;i<grid.length;i++) if(!grid[i]&&!keep[i]) grid[i]=1;
  return cropToFloors({grid,w,h,W,H});
}

// 壁だけの行や列が残らないよう、床の外接矩形＋壁1マスに切り詰める
function cropToFloors(L){
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
  let floors=0;
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const v=grid[(y+y0)*w+(x+x0)];
    ng[(y+1)*nw+(x+1)]=v;
    if(!v) floors++;
  }
  return {grid:ng, w:nw, h:nh, W, H, floors};
}

/* ================= 状態の表現 ================= */
// 状態 = 荷物の位置(昇順) + プレイヤーの到達領域の代表マス
const keyOf=(boxes,rep)=>{
  let s=String.fromCharCode(rep);
  for(let i=0;i<boxes.length;i++) s+=String.fromCharCode(boxes[i]);
  return s;
};
function regionRep(grid,w,boxSet,from){
  const seen=new Set([from]); const st=[from];
  let rep=from;
  while(st.length){
    const c=st.pop();
    if(c<rep) rep=c;
    for(const d of [1,-1,w,-w]){
      const q=c+d;
      if(grid[q]||boxSet.has(q)||seen.has(q)) continue;
      seen.add(q); st.push(q);
    }
  }
  return {rep, cells:seen};
}
// 荷物配置に対するプレイヤー領域の代表マス一覧
function regionsOf(grid,w,boxes){
  const boxSet=new Set(boxes);
  const seen=new Set();
  const reps=[];
  for(let c=0;c<grid.length;c++){
    if(grid[c]||boxSet.has(c)||seen.has(c)) continue;
    const r=regionRep(grid,w,boxSet,c);
    for(const x of r.cells) seen.add(x);
    reps.push(r);
  }
  return reps;
}

/* ================= 解ける状態の完全列挙 =================
   完成状態から「引き」で到達できる状態 = そこから押して完成させられる状態。
   ビーム無しの全探索なので、得られる集合と手数は厳密。 */
function solvableStates(grid,w,goals,cap){
  const dist=new Map();
  const goalBoxes=goals.slice().sort((a,b)=>a-b);
  let frontier=[];
  for(const r of regionsOf(grid,w,goalBoxes)){
    const k=keyOf(goalBoxes,r.rep);
    dist.set(k,0);
    frontier.push({boxes:goalBoxes, rep:r.rep, cells:r.cells});
  }
  let d=0;
  while(frontier.length){
    if(dist.size>cap) return null;      // 大きすぎる盤面は捨てる
    const next=[];
    d++;
    for(const st of frontier){
      const boxSet=new Set(st.boxes);
      for(const b of st.boxes){
        for(const dir of [1,-1,w,-w]){
          const p=b+dir, q=b+2*dir;     // p: プレイヤーの立ち位置, q: 引いた後の立ち位置
          if(grid[p]||boxSet.has(p)) continue;
          if(grid[q]||boxSet.has(q)) continue;
          if(!st.cells.has(p)) continue;
          const boxes=st.boxes.slice();
          boxes[boxes.indexOf(b)]=p;
          boxes.sort((x,y)=>x-y);
          const r=regionRep(grid,w,new Set(boxes),q);
          const k=keyOf(boxes,r.rep);
          if(dist.has(k)) continue;
          dist.set(k,d);
          next.push({boxes, rep:r.rep, cells:r.cells});
        }
      }
    }
    frontier=next;
  }
  return dist;
}

/* ================= 前向きの手の列挙 ================= */
function pushesFrom(grid,w,boxes,cells){
  const boxSet=new Set(boxes);
  const out=[];
  for(const b of boxes){
    for(const dir of [1,-1,w,-w]){
      const from=b-dir, to=b+dir;       // from に立って dir 方向へ押す
      if(grid[from]||boxSet.has(from)) continue;
      if(grid[to]||boxSet.has(to)) continue;
      if(!cells.has(from)) continue;
      const nb=boxes.slice();
      nb[nb.indexOf(b)]=to;
      nb.sort((x,y)=>x-y);
      const r=regionRep(grid,w,new Set(nb),b);
      out.push({box:b, dir, to, boxes:nb, rep:r.rep, cells:r.cells, key:keyOf(nb,r.rep)});
    }
  }
  return out;
}

/* ================= 素直に押したらどうなるか ================= */
// 「近い置き場へ寄せる」式の素直な手筋を数種類走らせ、詰むかどうかを見る。
// 全部詰むなら、その面は素直な読みでは解けない = ひらめきが要る。
function greedyPolicies(grid,w,goals){
  const goalSet=new Set(goals);
  const near=new Int32Array(grid.length).fill(-1);
  {
    const q=goals.slice();
    for(const g of goals) near[g]=0;
    for(let i=0;i<q.length;i++){
      const c=q[i];
      for(const d of [1,-1,w,-w]){ const n=c+d; if(grid[n]||near[n]>=0) continue; near[n]=near[c]+1; q.push(n); }
    }
  }
  const sum=boxes=>boxes.reduce((s,b)=>s+(near[b]<0?99:near[b]),0);
  return [
    // 1) 置き場に乗るなら乗せる。でなければ置き場に近づく手
    {name:'寄せ', rank:(m,boxes)=>(goalSet.has(m.to)?-100:0)+sum(m.boxes)},
    // 2) いちばん置き場に近い荷物から片付ける
    {name:'近い順', rank:(m,boxes)=>(goalSet.has(m.to)?-100:0)+near[m.box]*2+sum(m.boxes)},
    // 3) いちばん遠い荷物から片付ける
    {name:'遠い順', rank:(m,boxes)=>(goalSet.has(m.to)?-100:0)-near[m.box]*2+sum(m.boxes)},
  ];
}
// 素直に押していったときに詰むまでの手数を返す(解けたら null)
function greedyOutcome(grid,w,goals,dist,start,policy,limit){
  let boxes=start.boxes.slice(), cells=start.cells;
  const goalSet=new Set(goals);
  const seen=new Set();
  for(let step=0;step<limit;step++){
    if(boxes.every(b=>goalSet.has(b))) return null;         // 素直に解けてしまった
    const moves=pushesFrom(grid,w,boxes,cells);
    if(!moves.length) return step;                          // 動かせない = 詰み
    moves.sort((a,b)=>policy.rank(a,boxes)-policy.rank(b,boxes) || a.key.localeCompare(b.key));
    const m=moves[0];
    if(seen.has(m.key)) return step;                        // 同じ場所をぐるぐる = 進めない
    seen.add(m.key);
    if(!dist.has(m.key)) return step;                       // ここで詰んだ
    boxes=m.boxes; cells=m.cells;
  }
  return limit;
}

/* ================= 「ひらめき度」の測定 ================= */
// 最短手順を1本たどりながら、各場面での選択肢の質を数える
function analyse(grid,w,goals,dist,start,rng,policies){
  const goalSet=new Set(goals);
  // 各マスから最寄り置き場までの距離(逆行の判定に使う)
  const near=new Int32Array(grid.length).fill(-1);
  {
    const q=goals.slice();
    for(const g of goals) near[g]=0;
    for(let i=0;i<q.length;i++){
      const c=q[i];
      for(const d of [1,-1,w,-w]){ const n=c+d; if(grid[n]||near[n]>=0) continue; near[n]=near[c]+1; q.push(n); }
    }
  }
  let boxes=start.boxes.slice(), cells=start.cells;
  let d=dist.get(keyOf(boxes,start.rep));
  const total=d;
  let traps=0, legalTotal=0, forced=0, decoys=0;
  let offGoal=false, away=false, firstOnly=false;
  let step=0;
  while(d>0){
    const moves=pushesFrom(grid,w,boxes,cells);
    legalTotal+=moves.length;
    const alive=moves.filter(m=>dist.has(m.key));
    const best=alive.filter(m=>dist.get(m.key)===d-1);
    traps += moves.length-alive.length;
    decoys += alive.length-best.length;
    if(alive.length===1 && moves.length>=3) forced++;
    if(step===0 && alive.length===1 && moves.length>=3) firstOnly=true;
    if(!best.length) return null;        // ここに来たら距離表が壊れている
    // 逆行: 置き場から荷物をどける / 置き場から遠ざける手しか正解がない
    if(best.every(m=>goalSet.has(m.box))) offGoal=true;
    if(best.every(m=>near[m.to]>near[m.box])) away=true;
    const chosen=best[rng()*best.length|0];
    boxes=chosen.boxes; cells=chosen.cells; d--;
    step++;
  }
  const trapRatio = legalTotal ? traps/legalTotal : 0;
  // 素直な手筋が通用するか
  let greedyDied=0, greedySolved=0, firstDeath=Infinity;
  for(const pol of policies){
    const r=greedyOutcome(grid,w,goals,dist,start,pol,total*3+10);
    if(r===null) greedySolved++;
    else { greedyDied++; if(r<firstDeath) firstDeath=r; }
  }
  // 難しさ = 手数ではなく「素直に押すと詰む」「正解が細い」度合い
  const score = forced*3 + trapRatio*12 + decoys*0.1
              + (offGoal?5:0) + (away?2:0) + (firstOnly?4:0)
              + greedyDied*4 - greedySolved*6
              + (greedyDied===policies.length && firstDeath<=2 ? 4 : 0);
  return {pushes:total, traps, trapRatio, forced, decoys, offGoal, away, firstOnly,
          greedyDied, greedySolved, firstDeath:firstDeath===Infinity?null:firstDeath, score};
}

/* ================= 生成本体 ================= */
function generate(seed, cfg){
  const rng=mulberry32(seed);
  const deadline=Date.now()+(cfg.budget||8000);
  let best=null;
  for(let attempt=0; attempt<cfg.tries; attempt++){
    if(best && Date.now()>deadline) break;
    const W=randInt(cfg.W[0],cfg.W[1],rng), H=randInt(cfg.H[0],cfg.H[1],rng);
    const layout=randomLayout(rng,W,H,cfg.wallLo+rng()*(cfg.wallHi-cfg.wallLo));
    if(!layout) continue;
    const {grid,w}=layout;
    const floors=[];
    for(let i=0;i<grid.length;i++) if(!grid[i]) floors.push(i);
    const nbox=randInt(cfg.minBoxes,cfg.maxBoxes,rng);
    if(floors.length<nbox*3+3||floors.length>cfg.maxFloors) continue;

    // 置き場も完全ランダム
    const goals=shuffle(floors.slice(),rng).slice(0,nbox).sort((a,b)=>a-b);
    const dist=solvableStates(grid,w,goals,cfg.stateCap);
    if(!dist) continue;

    // 解ける状態の中から、手数が短めのものを候補にする
    const cands=[];
    for(const [k,d] of dist){
      if(d<cfg.minPush||d>cfg.maxPush) continue;
      const rep=k.charCodeAt(0);
      const boxes=[];
      for(let i=1;i<k.length;i++) boxes.push(k.charCodeAt(i));
      cands.push({boxes, rep, d});
    }
    if(!cands.length) continue;
    const policies=greedyPolicies(grid,w,goals);
    shuffle(cands,rng);
    for(const c of cands.slice(0,cfg.samples)){
      const r=regionRep(grid,w,new Set(c.boxes),c.rep);
      const a=analyse(grid,w,goals,dist,{boxes:c.boxes, rep:c.rep, cells:r.cells},rng,policies);
      if(!a) continue;
      const puzzle={
        grid, w:layout.w, h:layout.h, W:layout.W, H:layout.H,
        boxes:c.boxes, goals, player:c.rep,
        pushes:a.pushes, stats:a, states:dist.size
      };
      const inBand = a.score>=cfg.minScore && (cfg.maxScore==null||a.score<=cfg.maxScore)
                     && a.greedyDied>=(cfg.needGreedyDead||0);
      if(inBand) return puzzle;
      // 帯に入らなければ、いちばん帯に近いものを控えにする
      const gap=a.score<cfg.minScore ? cfg.minScore-a.score : (cfg.maxScore==null?0:a.score-cfg.maxScore);
      if(!best||gap<best.gap){ puzzle.gap=gap; best=puzzle; }
    }
  }
  return best;
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

// 難易度は手数ではなく「素直な手筋がどれだけ通用しないか」で分ける
const DIFF={
  // やさしい: 素直に押していけば解ける小さな面
  easy:  {W:[4,5],H:[4,5],minBoxes:2,maxBoxes:3,wallLo:0.05,wallHi:0.22,minPush:4,maxPush:9,
          minScore:0, maxScore:8, needGreedyDead:0,
          tries:250,samples:50,maxFloors:22,stateCap:60000,budget:4000},
  // ふつう: 素直な手筋のうち少なくとも2つは詰む
  normal:{W:[5,6],H:[5,6],minBoxes:2,maxBoxes:3,wallLo:0.08,wallHi:0.28,minPush:5,maxPush:14,
          minScore:16,maxScore:null,needGreedyDead:2,
          tries:300,samples:60,maxFloors:28,stateCap:120000,budget:6000},
  // むずかしい: 素直な手筋が全滅し、正解が細い(一本道 / 置き場から一度どける等)
  hard:  {W:[5,6],H:[5,6],minBoxes:3,maxBoxes:4,wallLo:0.10,wallHi:0.30,minPush:6,maxPush:18,
          minScore:28,maxScore:null,needGreedyDead:3,
          tries:400,samples:80,maxFloors:30,stateCap:200000,budget:9000},
};

/* ================= 外部に公開 ================= */
// ページからも生成ワーカーからも同じファイルを読み込む
(function(root){
  root.WarehouseEngine={generate, DIFF, solvableStates, regionRep, regionsOf, pushesFrom, keyOf, mulberry32};
})(typeof self!=='undefined'?self:this);
