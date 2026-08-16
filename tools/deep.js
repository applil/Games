'use strict';
/* 深い局面を、全部を数え上げずに見つける道具。
 *
 * これまでの solvableStates は、解ける局面を残らず数える。正確だが、
 * 荷物7個・床60マスあたりから局面数が跳ね上がり、上限に当たって捨てるしかない。
 * それが「55手以上の面が1つも採れない」原因だった。
 *
 * ここでは幅を絞った逆探索を使う。
 *   ・置き場に全部乗った状態から、引き手をさかのぼる(solvableStates と同じ向き)
 *   ・各深さで、有望なものだけ beam 個だけ残す(全部は持たない)
 *   ・引いた回数は「その状態を作るのに使った手数」であって、最短の保証はない
 *
 * なので最後に必ず tools/astar.js で解き直し、本当の最短手数を確定させる。
 * 見つける役(幅を絞った逆探索)と、確かめる役(A*)を分けるのが要点。
 */
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {regionsOf, regionRep, keyOf}=E;
const {minPushes, goalDist, assignCost}=require(path.join(__dirname,'astar.js'));

/* 幅を絞った逆探索。深さごとに beam 個だけ残して、目標の深さまで潜る。
 * 返すのは、各深さの代表(浅いものから順に並ぶ)。 */
function reverseBeam(grid, w, goals, opt){
  opt=opt||{};
  const beam=opt.beam||3000;
  const maxDepth=opt.depth||60;
  const gd=goals.map(g=>goalDist(grid,w,g));
  const goalBoxes=goals.slice().sort((a,b)=>a-b);
  const seen=new Set();
  let frontier=[];
  for(const r of regionsOf(grid,w,goalBoxes)){
    seen.add(keyOf(goalBoxes,r.rep));
    frontier.push({boxes:goalBoxes, rep:r.rep, cells:r.cells});
  }
  const out=[];
  for(let d=1; d<=maxDepth && frontier.length; d++){
    const next=[];
    for(const st of frontier){
      const boxSet=new Set(st.boxes);
      for(const b of st.boxes){
        for(const dir of [1,-1,w,-w]){
          const p=b+dir, q=b+2*dir;        // p:立ち位置 q:引いたあとの立ち位置
          if(grid[p]||boxSet.has(p)) continue;
          if(grid[q]||boxSet.has(q)) continue;
          if(!st.cells.has(p)) continue;
          const boxes=st.boxes.slice();
          boxes[boxes.indexOf(b)]=p;
          boxes.sort((x,y)=>x-y);
          const r=regionRep(grid,w,new Set(boxes),q);
          const k=keyOf(boxes,r.rep);
          if(seen.has(k)) continue;
          seen.add(k);
          next.push({boxes, rep:r.rep, cells:r.cells});
        }
      }
    }
    if(!next.length) break;
    // 残すものを2種類の見方で選ぶ。
    //   運搬の下限が大きい = 遠くまで運ばせる = 手数が伸びる
    //   下限が小さいのに、ここまで引くのに手数がかかった = こんがらがっている
    // 前者だけを残すと「長いだけで、まっすぐ運べば終わる面」ばかりになる。
    // (実際、最初にそれで作ったら経路のズレが軒並み 0 になった)
    for(const st of next) st.lb=assignCost(gd, st.boxes);
    let keep=next;
    if(next.length>beam){
      const far=next.slice().sort((a,b)=>b.lb-a.lb);
      const tangled=next.slice().sort((a,b)=>a.lb-b.lb);
      const picked=new Set(), head=[];
      const take=(arr,n)=>{ for(const st of arr){ if(head.length>=beam||n<=0) break;
        if(picked.has(st)) continue; picked.add(st); head.push(st); n--; } };
      take(far, Math.floor(beam*0.45));
      take(tangled, Math.floor(beam*0.45));
      const step=Math.max(1, Math.floor(next.length/Math.max(1,beam-head.length)));
      for(let i=0;i<next.length && head.length<beam;i+=step) take([next[i]],1);
      keep=head;
    }
    frontier=keep;
    out.push({depth:d, states:keep});
  }
  return out;
}

/* 進捗して見える押し手だけを繋いで解けてしまうか(表を使わない版)。
 * 「素直に解ける」面はラベル16面中15面が✕だったので、必ず弾く。 */
function naiveSolvable(grid, w, goals, gd, boxes0, rep0, limit){
  limit=limit||20000;
  const goalSet=new Set(goals);
  const dirs=[1,-1,w,-w];
  const start={boxes:boxes0.slice().sort((a,b)=>a-b), rep:rep0};
  const seen=new Set([keyOf(start.boxes,start.rep)]);
  const stack=[start];
  let n=0;
  while(stack.length){
    const st=stack.pop();
    if(st.boxes.every(b=>goalSet.has(b))) return true;
    if(++n>limit) return false;
    const boxSet=new Set(st.boxes);
    const reach=new Uint8Array(grid.length);
    const q=[st.rep]; reach[st.rep]=1;
    for(let i=0;i<q.length;i++){
      const c=q[i];
      for(const d of dirs){
        const nn=c+d;
        if(grid[nn]||boxSet.has(nn)||reach[nn]) continue;
        reach[nn]=1; q.push(nn);
      }
    }
    // その荷物にとって「いちばん近い空いている置き場」への距離
    const near=b=>{
      let best=-1;
      for(let j=0;j<goals.length;j++){
        if(boxSet.has(goals[j]) && goals[j]!==b) continue;   // 埋まっている置き場は数えない
        const v=gd[j][b];
        if(v<0) continue;
        if(best<0||v<best) best=v;
      }
      return best;
    };
    for(const b of st.boxes){
      const d0=near(b);
      if(d0<0) continue;
      for(const d of dirs){
        const stand=b-d, to=b+d;
        if(!reach[stand]) continue;
        if(grid[to]||boxSet.has(to)) continue;
        const nb=st.boxes.slice();
        nb[nb.indexOf(b)]=to; nb.sort((x,y)=>x-y);
        const ns=new Set(nb);
        // 近づいて見える手だけを繋ぐ
        let d1=-1;
        for(let j=0;j<goals.length;j++){
          if(ns.has(goals[j]) && goals[j]!==to) continue;
          const v=gd[j][to];
          if(v<0) continue;
          if(d1<0||v<d1) d1=v;
        }
        if(d1<0||d1>=d0) continue;
        const nrep=regionRep(grid,w,ns,b).rep;
        const k=keyOf(nb,nrep);
        if(seen.has(k)) continue;
        seen.add(k);
        stack.push({boxes:nb, rep:nrep});
      }
    }
  }
  return false;
}

/* 盤1枚から、深い面を採る。
 * 逆探索で候補を出し、A* で最短手数を確定させてから返す。 */
function harvestDeep(grid, w, goals, opt){
  opt=opt||{};
  const minPush=opt.minPush||45;
  const minMano=opt.minMano!==undefined?opt.minMano:0.25;
  const want=opt.want||2;
  const gd=goals.map(g=>goalDist(grid,w,g));
  const layers=reverseBeam(grid, w, goals, {beam:opt.beam||2500, depth:opt.depth||(minPush*2)});
  const out=[];
  // 深いほうから見る。引いた回数は最短の保証ではないので、A* で確かめる
  for(let i=layers.length-1; i>=0 && out.length<want; i--){
    const layer=layers[i];
    if(layer.depth<minPush) break;                 // これ以上浅い層に用はない
    // 層の先頭だけを見ると、選び方の偏りがそのまま出る。層全体から等間隔で拾う
    const tries=opt.tries||6;
    const step=Math.max(1, Math.floor(layer.states.length/tries));
    const cand=[];
    for(let j=0; j<layer.states.length; j+=step){
      const st=layer.states[j];
      const carry=assignCost(gd, st.boxes.slice().sort((a,b)=>a-b));
      // A* は高いので、下限の時点で見込みのないものは先に落とす。
      //   下限が大きすぎる → まっすぐ運ぶだけの面になる
      //   下限が小さすぎる → そもそも minPush 手に届かない
      //   (押し手数は必ず下限以上、経路のズレの上限をだいたい0.72と見て逆算する)
      if(carry>minPush*(1-minMano)*1.6) continue;
      if(carry<minPush*0.28) continue;
      cand.push({st, carry});
      if(cand.length>=tries) break;
    }
    // まず軽い上限で全部を試し、それでも足りなければ重い上限でやり直す。
    // 「重い盤に何十秒もかけて結局だめ」を避ける
    const rounds=[Math.round((opt.nodes||6e5)*0.15), opt.nodes||6e5];
    for(const nodes of rounds){
      for(const c of cand){
        if(out.length>=want) break;
        if(c.done) continue;
        const p=minPushes(grid, w, goals, c.st.boxes, c.st.rep, {nodes});
        if(p===undefined) continue;                  // 上限超え。次の合で試す
        c.done=true;                                 // 答えが出た(採否は別)
        if(p===null || p<minPush) continue;
        if((p-c.carry)/p < minMano) continue;        // まっすぐ運ぶだけで終わる
        if(naiveSolvable(grid, w, goals, gd, c.st.boxes, c.st.rep)) continue;
        out.push({boxes:c.st.boxes.slice(), rep:c.st.rep, p, carry:c.carry,
                  mano:+((p-c.carry)/p).toFixed(2), pulls:layer.depth});
      }
      if(out.length>=want) break;
    }
  }
  return out;
}

module.exports={reverseBeam, naiveSolvable, harvestDeep};
