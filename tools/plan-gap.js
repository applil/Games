'use strict';
/* 「最初にこうかな、と思う解法」と「実際の解法」のズレを測る。
 *
 * 素朴な計画 = 荷物をそれぞれ一番近い置き場に割り当て、近い順にまっすぐ押す。
 * 盤を見た人が最初に思い浮かべるのはこれ。実際の最短手順と、
 *   割り当て … その荷物が結局ちがう置き場へ行かされる
 *   順番   … 近いものから置けず、遠いものを先に置かされる
 *   経路   … まっすぐ押せず、遠回りさせられる
 * の3つでどれだけ食い違うかを見る。全部「あてが外れる」の別の側面。
 */
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const X=require(path.join(__dirname,'xsb.js'));
const M=require(path.join(__dirname,'manoeuvre.js'));

function planGap(board){
  const p=X.fromXSB(board.split('/'));
  const table=E.solvableStates(p.grid,p.w,p.goals,3000000);
  if(!table) return null;
  const start=p.boxes.slice().sort((a,b)=>a-b);
  const reg=E.regionRep(p.grid,p.w,new Set(start),p.player);
  const k0=E.keyOf(start, reg.rep);
  if(!table.has(k0)) return null;

  // --- 素朴な計画 ---
  // 荷物→置き場の距離表。近い組から順に取っていく(人が目で見て決める順)
  const D=start.map(b=>p.goals.map(g=>M.pushDist(p.grid,p.w,b,g)));
  const pairs=[];
  for(let i=0;i<start.length;i++) for(let j=0;j<p.goals.length;j++)
    if(D[i][j]>=0) pairs.push({i,j,d:D[i][j]});
  pairs.sort((a,b)=>a.d-b.d||a.i-b.i||a.j-b.j);
  const naive=new Array(start.length).fill(-1), usedG=new Set();
  for(const q of pairs){ if(naive[q.i]>=0||usedG.has(q.j)) continue; naive[q.i]=q.j; usedG.add(q.j); }
  // 素朴な順番 = 近い荷物から片付ける
  const naiveOrder=start.map((_,i)=>i).filter(i=>naive[i]>=0)
    .sort((a,b)=>D[a][naive[a]]-D[b][naive[b]]||a-b);

  // --- 実際の最短手順を1つ取り出す(荷物を区別して追う) ---
  const prev=new Map([[k0,null]]);
  const info=new Map([[k0,{boxes:start, cells:reg.cells}]]);
  let goalKey=null;
  const q2=[k0];
  while(q2.length){
    const k=q2.shift(), s=info.get(k), d=table.get(k);
    if(d===0){ goalKey=k; break; }
    for(const m of E.pushesFrom(p.grid,p.w,s.boxes,s.cells)){
      if(!table.has(m.key)||table.get(m.key)!==d-1||prev.has(m.key)) continue;
      prev.set(m.key,{from:k, boxes:m.boxes.slice().sort((a,b)=>a-b)});
      info.set(m.key,{boxes:m.boxes.slice().sort((a,b)=>a-b), cells:m.cells});
      q2.push(m.key);
    }
  }
  if(goalKey===null) return null;
  const chain=[]; for(let k=goalKey;k!==null;){ const e=prev.get(k); chain.push(info.get(k).boxes); k=e?e.from:null; }
  chain.reverse();

  // 荷物に番号を振って追いかける
  let pos=start.slice();
  const idOf=c=>pos.indexOf(c);
  const steps=[];                              // {id, from, to}
  for(let t=1;t<chain.length;t++){
    const a=chain[t-1], b=chain[t];
    const from=a.find(c=>!b.includes(c)), to=b.find(c=>!a.includes(c));
    const id=idOf(from);
    pos[id]=to;
    steps.push({id, from, to});
  }
  const finalPos=pos.slice();
  // 実際の割り当て
  const actual=finalPos.map(c=>p.goals.indexOf(c));
  // 実際に置き場に収まった順番(最後にその荷物が動いた時刻の順)
  const last=new Array(start.length).fill(-1);
  steps.forEach((s,t)=>{ last[s.id]=t; });
  const actualOrder=start.map((_,i)=>i).sort((a,b)=>last[a]-last[b]);

  // --- ズレを数える ---
  const nb=start.length;
  let mis=0;
  for(let i=0;i<nb;i++) if(naive[i]<0||naive[i]!==actual[i]) mis++;
  // 順番のズレ = 入れ替えが必要な組の数(Kendall)
  const rank={}; actualOrder.forEach((id,r)=>rank[id]=r);
  let inv=0, tot=0;
  for(let a=0;a<naiveOrder.length;a++) for(let b=a+1;b<naiveOrder.length;b++){
    tot++; if(rank[naiveOrder[a]]>rank[naiveOrder[b]]) inv++;
  }
  // 経路のズレ = 実際の押し手数 / まっすぐ押したときの手数
  const carry=M.carryCost(p.grid,p.w,start,p.goals);
  const pushes=table.get(k0);

  return {
    boxes:nb, pushes, carry,
    assignGap:+(mis/nb).toFixed(2),                       // 置き場のあてが外れた荷物の割合
    orderGap: tot? +(inv/tot).toFixed(2) : 0,             // 順番のあてが外れた割合
    routeGap: +((pushes-carry)/Math.max(1,pushes)).toFixed(2),
  };
}
module.exports={planGap};
