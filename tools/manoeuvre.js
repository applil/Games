'use strict';
/* 「運搬でない押し手の割合」を測るための共通処理。
 *
 * 各荷物をまっすぐ置き場へ押すだけなら何手で済むか(運搬の下限)を、
 * 荷物と置き場の割り当てを全通り試して求める。
 * 実際の最短手数からそれを引いた残りが、運搬以外に費やされる手。
 * この割合が高いほど、盤を見ただけでは手順が決まらない = 頭を使う。
 */

// 1つの荷物を、他の荷物を無視して置き場まで押すのに要る最小手数
// (押すには荷物の反対側に立てる必要があるので、そこだけは見る)
function pushDist(grid, w, from, goal){
  const d=new Int32Array(grid.length).fill(-1);
  d[from]=0;
  const q=[from];
  for(let i=0;i<q.length;i++){
    const c=q[i];
    for(const dd of [1,-1,w,-w]){
      const n=c+dd;
      if(grid[n]||d[n]>=0) continue;
      if(grid[c-dd]) continue;                 // 押す側に立てない
      d[n]=d[c]+1; q.push(n);
    }
  }
  return d[goal];
}

const permutations=a=>a.length<=1 ? [a]
  : a.flatMap((x,i)=>permutations(a.slice(0,i).concat(a.slice(i+1))).map(r=>[x,...r]));

// 運搬の下限。届かない割り当てしかなければ null
function carryCost(grid, w, boxes, goals){
  const D=boxes.map(b=>goals.map(g=>pushDist(grid,w,b,g)));
  let best=Infinity;
  for(const idx of permutations(goals.map((_,i)=>i))){
    let s=0, ok=true;
    for(let i=0;i<boxes.length;i++){ const v=D[i][idx[i]]; if(v<0){ ok=false; break; } s+=v; }
    if(ok&&s<best) best=s;
  }
  return isFinite(best) ? best : null;
}

// 実際の最短手数と合わせて、運搬でない押し手の割合を出す
function manoeuvre(grid, w, boxes, goals, pushes){
  const carry=carryCost(grid, w, boxes, goals);
  if(carry===null) return null;
  return {carry, ratio:+((pushes-carry)/Math.max(1,pushes)).toFixed(2)};
}

module.exports={pushDist, carryCost, manoeuvre};
