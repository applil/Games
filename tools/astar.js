'use strict';
/* 1つの局面だけを、最短の押し手数で解く探索。
 *
 *   const {minPushes}=require('./astar.js');
 *   minPushes(grid, w, goals, boxes, player, {nodes:2e6});
 *
 * これまでは solvableStates で全局面を数え上げていた。正確で、囮や順番の
 * 指標もそこから取れるが、荷物が7個・床が60マスを超えると局面数が爆発して
 * 何分待っても終わらない。深い面(45手以上)を作るには別の道具が要る。
 *
 * ここでは前向きの A*。
 *   状態  … 荷物の位置(整列)＋自機の到達領域の代表マス
 *   コスト… 押した回数(歩数は数えない。ゲームの手数と同じ)
 *   下限  … 荷物ごとの「置き場までの押し距離」を、荷物と置き場の割り当てで
 *           最小化したもの。他の荷物を無視するので、必ず本当の手数以下になる
 *           (ビットDPで 2^n·n。8個で2000通り程度)
 *
 * 下限が本当の手数を超えないので、最初に取り出せた解が最短であることが保証される。
 * 詰みの枝は、角詰まりと2x2の固まりで落とす(見つかる範囲だけ。見逃しても
 * 正しさには影響しない。探索が遅くなるだけ)。
 */
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {regionRep, keyOf}=E;

// 置き場ごとの「そのマスから押して置き場まで運ぶのに必要な最小押し回数」
// (他の荷物は無視する。押す側に立てるかだけは見る)
function goalDist(grid, w, goal){
  const d=new Int32Array(grid.length).fill(-1);
  d[goal]=0;
  const q=[goal];
  for(let i=0;i<q.length;i++){
    const c=q[i];
    for(const dd of [1,-1,w,-w]){
      const from=c-dd;
      if(grid[from]||d[from]>=0) continue;
      if(grid[from-dd]) continue;
      d[from]=d[c]+1; q.push(from);
    }
  }
  return d;
}

// 荷物と置き場の割り当てを、押し距離の合計が最小になるように選ぶ(ビットDP)
function assignCost(gd, boxes){
  const n=boxes.length, full=(1<<n)-1;
  const dp=new Int32Array(full+1).fill(0x3fffffff);
  dp[0]=0;
  for(let m=0;m<=full;m++){
    const cur=dp[m];
    if(cur>=0x3fffffff) continue;
    let i=0, mm=m; while(mm){ i+=mm&1; mm>>=1; }
    if(i>=n) continue;
    const b=boxes[i];
    for(let j=0;j<n;j++){
      if(m&(1<<j)) continue;
      const v=gd[j][b];
      if(v<0) continue;                       // その置き場へは運べない
      const nm=m|(1<<j);
      if(cur+v<dp[nm]) dp[nm]=cur+v;
    }
  }
  return dp[full]>=0x3fffffff ? -1 : dp[full];
}

// 死に節点を安く落とす。見逃しは許すが、生きている枝を殺してはいけない
function makeDeadCheck(grid, w, goalSet){
  // 角のマス(2方向が壁で、置き場でない)は、そこに入れたら二度と出せない
  const corner=new Uint8Array(grid.length);
  for(let i=0;i<grid.length;i++){
    if(grid[i]||goalSet.has(i)) continue;
    const up=grid[i-w], dn=grid[i+w], lf=grid[i-1], rt=grid[i+1];
    if((up||dn)&&(lf||rt)) corner[i]=1;
  }
  // 2x2 が「壁か荷物」で埋まっていて、その中の荷物がひとつでも置き場に無ければ詰み
  const frozen=(boxSet, c)=>{
    for(const [a,b,d] of [[-1,-w,-w-1],[1,-w,-w+1],[-1,w,w-1],[1,w,w+1]]){
      const p1=c+a, p2=c+b, p3=c+d;
      const f=x=>grid[x]||boxSet.has(x);
      if(f(p1)&&f(p2)&&f(p3)){
        // 4マスのうち荷物が全部置き場なら、動かす必要がないので詰みではない
        const cells=[c,p1,p2,p3].filter(x=>boxSet.has(x));
        if(cells.some(x=>!goalSet.has(x))) return true;
      }
    }
    return false;
  };
  return {corner, frozen};
}

/* 最短の押し手数を返す。届かなければ null、上限を超えたら undefined */
function minPushes(grid, w, goals, boxes0, player0, opt){
  opt=opt||{};
  const NODES=opt.nodes||2e6;
  const goalSet=new Set(goals);
  const gd=goals.map(g=>goalDist(grid,w,g));
  const {corner, frozen}=makeDeadCheck(grid, w, goalSet);
  const dirs=[1,-1,w,-w];

  const start=boxes0.slice().sort((a,b)=>a-b);
  const h0=assignCost(gd, start);
  if(h0<0) return null;
  const rep0=regionRep(grid, w, new Set(start), player0).rep;

  // f(=g+h) ごとの棚。押し距離は整数で、しかも小さいので、これで十分速い
  const buckets=[];
  const push=(f, item)=>{ (buckets[f]||(buckets[f]=[])).push(item); };
  const seen=new Map();                       // 状態キー → そこまでの最小 g
  seen.set(keyOf(start, rep0), 0);
  push(h0, {boxes:start, rep:rep0, g:0});

  let nodes=0;
  const done=v=>{ if(opt.stat) opt.stat.nodes=nodes; return v; };
  for(let f=0; f<buckets.length || f<=h0; f++){
    const bucket=buckets[f];
    if(!bucket) continue;
    while(bucket.length){
      const st=bucket.pop();
      const key=keyOf(st.boxes, st.rep);
      if(seen.get(key)<st.g) continue;        // もっと安く来られた
      if(st.boxes.every(b=>goalSet.has(b))) return done(st.g);
      if(++nodes>NODES) return done(undefined);

      const boxSet=new Set(st.boxes);
      // 自機が行ける範囲を出す
      const reach=new Uint8Array(grid.length);
      const q=[st.rep]; reach[st.rep]=1;
      for(let i=0;i<q.length;i++){
        const c=q[i];
        for(const d of dirs){
          const n=c+d;
          if(grid[n]||boxSet.has(n)||reach[n]) continue;
          reach[n]=1; q.push(n);
        }
      }
      for(const b of st.boxes){
        for(const d of dirs){
          const stand=b-d, to=b+d;
          if(!reach[stand]) continue;                       // そこに立てない
          if(grid[to]||boxSet.has(to)) continue;            // 押した先が塞がっている
          if(corner[to]) continue;                          // 角に入れたら終わり
          const nb=st.boxes.slice();
          nb[nb.indexOf(b)]=to; nb.sort((x,y)=>x-y);
          const ns=new Set(nb);
          if(frozen(ns, to)) continue;
          const h=assignCost(gd, nb);
          if(h<0) continue;                                 // 運べない置き場が出た
          const nrep=regionRep(grid, w, ns, b).rep;         // 押したあと自機は元の荷物の位置
          const nk=keyOf(nb, nrep), ng=st.g+1;
          const old=seen.get(nk);
          if(old!==undefined && old<=ng) continue;
          seen.set(nk, ng);
          push(ng+h, {boxes:nb, rep:nrep, g:ng});
        }
      }
    }
  }
  return done(null);
}

module.exports={minPushes, goalDist, assignCost};

if(require.main===module){
  const fs=require('fs');
  const X=require(path.join(__dirname,'xsb.js'));
  const file=process.argv[2]||path.join(__dirname,'..','warehouse','levels.json');
  const from=+(process.argv[3]||1), to=+(process.argv[4]||20);
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  let ok=0, ng=0, over=0, ms=0;
  for(let i=from-1;i<Math.min(to, data.levels.length);i++){
    const lv=data.levels[i];
    const p=X.fromXSB(lv.b.split('/'));
    const t0=Date.now();
    const got=minPushes(p.grid, p.w, p.goals, p.boxes, p.player, {nodes:2e6});
    ms+=Date.now()-t0;
    if(got===undefined){ over++; console.log(`第${i+1}面 上限超え`); }
    else if(got!==lv.p){ ng++; console.log(`第${i+1}面 記録${lv.p}手 / 実測${got}`); }
    else ok++;
  }
  console.log(`一致${ok} 不一致${ng} 上限超え${over} / ${ms}ミリ秒`);
}
