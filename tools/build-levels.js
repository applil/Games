'use strict';
/* 面プールを作って warehouse/levels.json に書き出すツール。
 *
 *   node tools/build-levels.js [面数] [出力先]
 *
 * やっていること:
 *   1. 完全ランダムな盤面を作り、その【全状態】から解ける配置の集合を厳密に求める
 *   2. 解ける配置をいくつも評価し、難易度スコアを付ける
 *   3. 回転・鏡像を正規化して重複を落とす
 *   4. スコア順に並べたあと「局所シャッフル」して、
 *      易しい面と難しい面が混ざりつつ平均も下限も上がる並びにする
 */

const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {randomLayout, solvableStates, regionRep, greedyPolicies, analyse, mulberry32, keyOf, pushesFrom}=E;
const S=require(path.join(__dirname,'shapes.js'));

const TOTAL   = +(process.argv[2]||500);
const OUTPUT  = process.argv[3]||path.join(__dirname,'..','warehouse','levels.json');
const SEED    = 20260809;          // 並びを再現できるよう固定
const WINDOW  = 40;                // 局所シャッフルの窓幅 = 隣り合う面のばらけ具合
const KEEP_EASY  = 12;             // 冒頭のこの面数は並べ替えず、いちばん易しいまま残す
const SPICE_FROM = 20;             // ここから難しい面を差し込み始める
const SPICE_TO   = 700;            // ここまでで差し込みを終える
const SPICE_RATE = 0.20;           // 差し込む割合(最大)
const SPICE_JUMP = 4500;           // 何ランク先の候補から持ってくるか
const POOL_X  = 20;                 // 目標数の何倍の候補を作ってから間引くか
const BIG_COUNT  = 30;             // 301〜500 にばら撒く大きい面の数
const BIG_FROM   = 301;            // ばら撒く区間
const BIG_TO     = 500;
const BIG_POOL   = 90;             // その候補を何面用意するか
const EASE    = 0.75;              // <1 で易しい側の混雑を圧縮する(順位の進み方)
const STATE_CAP  = 150000;         // 全状態がこれを超える盤は捨てる(生成が重くなるため)
                                   // 遊ぶ側はこの表を作らないので、実行時の負担には関係しない
const DEPTH_MAX  = 30;             // 採用する最短手数の上限
const DEPTH_BIAS = 2.2;            // 深い(手数の長い)局面を選ぶ重み。大きいほど長い面が増える
const LEN_BONUS  = 0.6;            // 並べ替えのとき、手数1手あたりに足す難易度

const {toXSB, fromXSB, canonical, hashId}=require(path.join(__dirname,'xsb.js'));

/* ================= 1盤面から候補を集める ================= */
function harvest(rng, out, seen, cfg){
  // 形・大きさ・縦横比を型から抽選する(まだらな部屋ばかりにならないように)
  const layout=S.buildShape(rng,{});
  if(!layout) return;
  const {grid,w}=layout;
  const floors=[];
  for(let i=0;i<grid.length;i++) if(!grid[i]) floors.push(i);
  // 荷物の数は床の広さで決める。広い盤で荷物が多いと全状態が爆発するため
  const floorN=floors.length;
  const maxBox = floorN<=40 ? 4 : floorN<=75 ? 3 : 2;
  const nbox=2+(rng()*(maxBox-1)|0);
  if(floorN<nbox*3+2||floorN>150) return;

  // 置き場の配置も型から抽選する
  const gp=S.pickGoals(layout, floors, nbox, rng);
  if(!gp) return;
  const goals=gp.goals;

  const dist=solvableStates(grid,w,goals,STATE_CAP);
  if(!dist) return;
  const policies=greedyPolicies(grid,w,goals);

  // 解ける配置を手数ごとに分ける。浅い局面のほうが圧倒的に数が多いので、
  // 無作為に採ると3手の面ばかりになる。手数で層別にして深い側を厚く採る。
  const byDepth=new Map();
  for(const [k,d] of dist){
    if(d<3||d>DEPTH_MAX) continue;
    const rep=k.charCodeAt(0);
    const boxes=[];
    for(let i=1;i<k.length;i++) boxes.push(k.charCodeAt(i));
    if(!byDepth.has(d)) byDepth.set(d,[]);
    byDepth.get(d).push({boxes,rep,d});
  }
  if(!byDepth.size) return;
  const depths=[...byDepth.keys()];
  const weights=depths.map(d=>Math.pow(d,DEPTH_BIAS));
  const wsum=weights.reduce((a,b)=>a+b,0);
  const drawDepth=()=>{
    let r=rng()*wsum;
    for(let i=0;i<depths.length;i++){ r-=weights[i]; if(r<0) return depths[i]; }
    return depths[depths.length-1];
  };

  // 荷物の初期位置(近い/遠い/混在/動かしにくい)と
  // 人の立ち位置(広い場所/荷物のそば/通路の途中/初手が一択/初手が多彩)も型から狙う
  const wantStart=S.START_PATTERNS[rng()*S.START_PATTERNS.length|0];
  const wantPlayer=S.PLAYER_PATTERNS[rng()*S.PLAYER_PATTERNS.length|0];
  const maxDist=Math.max(...floors.map(c=>S.manhattan(w,c,goals[0])));
  const both=[], onlyBox=[], onlyPl=[], any=[];
  for(let t=0;t<90 && both.length<8;t++){
    const bucket=byDepth.get(drawDepth());
    const c=bucket[rng()*bucket.length|0];
    const reg=regionRep(grid,w,new Set(c.boxes),c.rep);
    const moves=pushesFrom(grid,w,c.boxes.slice().sort((x,y)=>x-y),reg.cells);
    const alive=moves.filter(m=>dist.has(m.key)).length;
    const okBox=S.matchesStart(wantStart, S.startProfile(layout,goals,c.boxes), maxDist);
    const okPl =S.matchesPlayer(wantPlayer, S.playerProfile(layout,c.boxes,c.rep,moves.length,alive));
    if(okBox&&okPl) both.push(c);
    else if(okBox&&onlyBox.length<8) onlyBox.push(c);
    else if(okPl&&onlyPl.length<8) onlyPl.push(c);
    else if(any.length<8) any.push(c);
  }
  // 両方そろわなければ片方だけ。どちらを優先するかは毎回入れ替える
  // (荷物の型を常に優先すると、人の立ち位置がいつも「そのまま」になる)
  const boxFirst=rng()<0.5;
  const second = boxFirst ? onlyBox : onlyPl;
  const third  = boxFirst ? onlyPl : onlyBox;
  const list = both.length?both : second.length?second : third.length?third : any;
  const usedBox = both.length || (second===onlyBox&&second.length) || (third===onlyBox&&!second.length&&third.length);
  const usedPl  = both.length || (second===onlyPl &&second.length) || (third===onlyPl &&!second.length&&third.length);
  const useStart  = usedBox ? wantStart  : 'そのまま';
  const usePlayer = usedPl  ? wantPlayer : 'そのまま';
  if(!list.length) return;

  // 同じ壁の面ばかり増やさないよう、何通りか評価して上下から1つずつ採る
  const scored=[];
  for(const c of list.slice(0,8)){
    const r=regionRep(grid,w,new Set(c.boxes),c.rep);
    const a=analyse(grid,w,goals,dist,{boxes:c.boxes,rep:c.rep,cells:r.cells},rng,policies);
    if(a) scored.push({c,a});
  }
  if(!scored.length) return;
  scored.sort((x,y)=>y.a.score-x.a.score);
  const picks = scored.length>1 ? [scored[0], scored[scored.length-1]] : [scored[0]];
  for(const {c,a} of picks){
    const p={grid,w:layout.w,h:layout.h,W:layout.W,H:layout.H,
             boxes:c.boxes,goals,player:c.rep,pushes:a.pushes,stats:a};
    const rows=toXSB(p);
    const key=canonical(rows);
    if(seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: hashId(key),
      b: rows.join('/'),
      p: a.pushes,
      s: +a.score.toFixed(1),
      k: +(a.score + Math.min(a.pushes, 16)*LEN_BONUS).toFixed(1),   // 並べ替え用
      tr: Math.round(a.trapRatio*100),
      f: a.forced,
      g: a.greedyDied,
      og: a.offGoal?1:0,
      sh: layout.shape,        // 形
      sz: layout.size,         // 大きさ
      ar: layout.aspect,       // 縦横比
      gp: gp.pattern,          // 置き場の配置
      sp: useStart,            // 荷物の初期位置の性格
      pl: usePlayer,           // 人の立ち位置
      cl: layout.clutter,      // 仕切りの密度
      st: dist.size,           // その盤の全状態数(重さの目安)
    });
  }
}

// 大きい盤だけを狙って採る。荷物は2〜3個(それ以上は全状態が爆発する)
function harvestBig(rng, out, seen){
  const size = rng()<0.5 ? '巨大' : '超巨大';
  const layout=S.buildShape(rng,{size});
  if(!layout) return;
  const {grid,w}=layout;
  const floors=[];
  for(let i=0;i<grid.length;i++) if(!grid[i]) floors.push(i);
  if(floors.length<24||floors.length>320) return;
  const nbox = floors.length>140 ? 2 : (2+(rng()*2|0));
  const gp=S.pickGoals(layout, floors, nbox, rng);
  if(!gp) return;
  const goals=gp.goals;
  const dist=solvableStates(grid,w,goals,STATE_CAP);
  if(!dist) return;
  const policies=greedyPolicies(grid,w,goals);
  // 大きい盤は運搬距離が長いので、深い局面を狙う
  const deep=[];
  for(const [k,d] of dist){
    if(d<8||d>60) continue;
    const rep=k.charCodeAt(0);
    const boxes=[];
    for(let i=1;i<k.length;i++) boxes.push(k.charCodeAt(i));
    deep.push({boxes,rep,d});
  }
  if(!deep.length) return;
  deep.sort((a,b)=>b.d-a.d);
  const take=deep.slice(0, Math.max(1, Math.round(deep.length*0.25)));
  for(let t=0;t<3;t++){
    const c=take[rng()*take.length|0];
    const r=regionRep(grid,w,new Set(c.boxes),c.rep);
    const a=analyse(grid,w,goals,dist,{boxes:c.boxes,rep:c.rep,cells:r.cells},rng,policies);
    if(!a) continue;
    const rows=toXSB({grid,w:layout.w,h:layout.h,boxes:c.boxes,goals,player:c.rep});
    const key=canonical(rows);
    if(seen.has(key)) continue;
    seen.add(key);
    out.push({
      id:hashId(key), b:rows.join('/'), p:a.pushes,
      s:+a.score.toFixed(1), k:+(a.score+Math.min(a.pushes,16)*LEN_BONUS).toFixed(1),
      tr:Math.round(a.trapRatio*100), f:a.forced, g:a.greedyDied, og:a.offGoal?1:0,
      sh:layout.shape, sz:layout.size, ar:layout.aspect, gp:gp.pattern,
      sp:'-', pl:'-', cl:layout.clutter, st:dist.size, big:1,
    });
    break;                          // 同じ盤から1面だけ
  }
}

/* ================= 生成 ================= */
console.log(`面プールを作ります (目標 ${TOTAL} 面)`);
const rng=mulberry32(SEED);
const levels=[], seen=new Set();
const t0=Date.now();
const POOL_TARGET=TOTAL*POOL_X;
let attempts=0, logged=0;
while(levels.length<POOL_TARGET && attempts<POOL_TARGET*200){
  attempts++;
  harvest(rng,levels,seen,{});
  if(levels.length>=logged+1000){
    logged=levels.length;
    process.stdout.write(`  ${logged} 面 (${((Date.now()-t0)/1000).toFixed(0)}秒 / 試行${attempts}回)\n`);
  }
}
console.log(`  候補 ${levels.length} 面 / 試行 ${attempts} 回 / ${((Date.now()-t0)/1000).toFixed(0)}秒`);

// 大きい盤を別枠で用意する
const tBig=Date.now();
let bigTries=0;
const bigStart=levels.length;
while(levels.length-bigStart<BIG_POOL && bigTries<BIG_POOL*80){
  bigTries++;
  harvestBig(rng, levels, seen);
}
console.log(`  大きい盤の候補 ${levels.length-bigStart} 面 / 試行 ${bigTries} 回 / ${((Date.now()-tBig)/1000).toFixed(0)}秒`);

/* ================= 難易度の設計 =================
   難しさを4つのパラメータに分けて、面ごとに独立に振る。
     ・手数        : 数値。徐々に上げる
     ・罠率        : 数値。徐々に上げる
     ・素直な手筋が3種とも詰むか : バイナリ。Yesになる確率を徐々に上げる
     ・正解が一本道 or 置き場から一度どける必要 : バイナリ。同じく確率を上げる
   数値2つには毎回ゆらぎを載せるので、隣り合う面の手応えはばらつく。
   確率で振るバイナリ2つも、序盤にたまに当たり、終盤はほぼ確実に当たる。   */

// 区間ごとの狙い。t は区間内の進み具合(0→1)
const SECTIONS=[
  // 1〜4: チュートリアル。本当に簡単
  {to:4,   push:t=>[2,3],            trap:t=>[0,12],        greedy:t=>0,           twist:t=>0},
  // 5〜20: 少し面白さが出てくる
  {to:20,  push:t=>[3,4+2*t],        trap:t=>[5,20+10*t],   greedy:t=>0.05+0.10*t, twist:t=>0.05+0.15*t},
  // 21〜100: 簡単だがパズルとして成立している(頭を使う)
  {to:100, push:t=>[4+t,6+3*t],      trap:t=>[15+10*t,35],  greedy:t=>0.20+0.20*t, twist:t=>0.25+0.20*t},
  // 101〜450: 手応えのある面を交えつつ、徐々に上げる
  {to:450, push:t=>[5+5*t,8+6*t],    trap:t=>[25+20*t,45+15*t], greedy:t=>0.45+0.45*t, twist:t=>0.45+0.40*t},
  // 451〜500: 難問揃い
  {to:500, push:t=>[10+3*t,16+4*t],  trap:t=>[45+10*t,100], greedy:t=>1,           twist:t=>1},
];
function specFor(i, n, rng){          // i は 0 始まり
  const stage=i+1;
  let from=1, sec=SECTIONS[SECTIONS.length-1];
  for(const s of SECTIONS){ if(stage<=s.to){ sec=s; break; } from=s.to+1; }
  const span=Math.max(1, sec.to-from);
  const t=Math.min(1,(stage-from)/span);
  const [pLo,pHi]=sec.push(t), [trLo,trHi]=sec.trap(t);
  // ゆらぎ: 帯の中から引く。ときどき帯を少しはみ出させて揺らす
  const jitter=(lo,hi)=>{
    const v=lo+(hi-lo)*rng();
    return rng()<0.15 ? v+(rng()<0.5?-1:1)*(hi-lo)*0.35 : v;
  };
  const greedyP=sec.greedy(t), twistP=sec.twist(t);
  return {
    stage,
    push:  Math.max(2, Math.round(jitter(pLo,pHi))),
    trap:  Math.max(0, Math.round(jitter(trLo,trHi))),
    // 確率で Yes/No を決める。序盤は明示的に No(易しさを保証する)
    greedy: rng()<greedyP ? true : (stage<=100 ? false : null),
    twist:  rng()<twistP  ? true : (stage<=100 ? false : null),
  };
}

// 仕様にいちばん近い面をプールから選ぶ。
// 直前の数面と形や置き場の型が続かないよう、変化のある面を優先する。
function chooseFor(spec, pool, used, recent){
  let best=null, bestCost=Infinity;
  for(let i=0;i<pool.length;i++){
    if(used[i]) continue;
    const l=pool[i];
    if(spec.big && !l.big) continue;          // 大きい面の枠
    if(!spec.big && l.big) continue;          // 大きい面は指定の枠だけに出す
    // バイナリは指定があれば必須条件
    if(spec.greedy===true  && l.g<3) continue;
    if(spec.greedy===false && l.g>=3) continue;
    const twisty = (l.f>=2||l.og);
    if(spec.twist===true  && !twisty) continue;
    if(spec.twist===false && twisty) continue;
    let cost=Math.abs(l.p-spec.push)*1.6 + Math.abs(l.tr-spec.trap)*0.09;
    // 直前3面と同じ形・置き場・大きさが続くのを避ける
    for(let r=0;r<recent.length;r++){
      const wgt=(recent.length-r);
      if(recent[r].sh===l.sh) cost+=1.2*wgt;
      if(recent[r].gp===l.gp) cost+=0.8*wgt;
      if(recent[r].sz===l.sz&&recent[r].ar===l.ar) cost+=0.4*wgt;
    }
    if(cost<bestCost){ bestCost=cost; best=i; }
  }
  return best;
}

const srng=mulberry32(SEED^0x5bf03635);
// 大きい面を入れるステージをあらかじめ決める(301〜500 に散らす)
const bigSlots=new Set();
{
  const span=BIG_TO-BIG_FROM+1;
  const step=span/BIG_COUNT;
  for(let i=0;i<BIG_COUNT;i++){
    const at=Math.round(BIG_FROM-1 + i*step + srng()*step);
    if(at>=0&&at<TOTAL) bigSlots.add(at);
  }
}
const pool=levels.slice();
const used=new Uint8Array(pool.length);
const picked=[];
const recent=[];
let missed=0;
for(let i=0;i<TOTAL;i++){
  let spec=specFor(i, TOTAL, srng);
  // 大きい面の枠は、広さを最優先にして条件を緩める
  // (広い盤は罠が少なく段取りで難しくなるので、小さい盤の指標では測れない)
  if(bigSlots.has(i)) spec=Object.assign({}, spec, {big:true, greedy:null, twist:null, trap:20});
  let idx=chooseFor(spec, pool, used, recent);
  if(idx==null){                       // 条件を満たす面が無ければ順に緩める
    missed++;
    for(const relax of [{twist:null},{greedy:null,twist:null},{greedy:null,twist:null,big:false}]){
      idx=chooseFor(Object.assign({},spec,relax), pool, used, recent);
      if(idx!=null) break;
    }
  }
  if(idx==null) break;
  used[idx]=1;
  const lv=pool[idx];
  lv.spec={p:spec.push, tr:spec.trap, g:spec.greedy, tw:spec.twist};
  picked.push(lv);
  recent.push(lv);
  if(recent.length>3) recent.shift();
}
levels.length=0;
levels.push(...picked);
console.log(`  仕様どおりに選べなかった面: ${missed}件 (条件を緩めて補充)`);

/* ================= 書き出し ================= */
const payload={
  version:1,
  seed:SEED,
  window:WINDOW,
  count:levels.length,
  levels,
};
fs.writeFileSync(OUTPUT, JSON.stringify(payload));
const bytes=fs.statSync(OUTPUT).size;
console.log(`\n${OUTPUT} に ${levels.length} 面を書き出しました (${(bytes/1024).toFixed(0)}KB)`);

/* ================= 並びの確認 ================= */
const SEGS=[[1,4],[5,20],[21,100],[101,200],[201,300],[301,450],[451,500]];
console.log('\n区間ごとの実測:');
console.log('  区間       手数(平均/最大)  罠率(平均)  素直に全滅  一本道or置き場どけ  荷物  盤の広さ');
for(const [a,b] of SEGS){
  const seg=levels.slice(a-1,b);
  if(!seg.length) continue;
  const avg=k=>seg.reduce((s,x)=>s+x[k],0)/seg.length;
  const g3=seg.filter(x=>x.g>=3).length;
  const tw=seg.filter(x=>x.f>=2||x.og).length;
  const nb=seg.reduce((s,x)=>s+(x.b.match(/[$*]/g)||[]).length,0)/seg.length;
  const area=seg.reduce((s,x)=>s+(x.b.split('/')[0].length-2)*(x.b.split('/').length-2),0)/seg.length;
  console.log(`  ${String(a+'-'+b).padEnd(9)} ${avg('p').toFixed(1).padStart(8)} /${String(Math.max(...seg.map(x=>x.p))).padStart(3)}  `
    +`${avg('tr').toFixed(0).padStart(8)}%  ${String(g3+'/'+seg.length).padStart(9)}  ${String(tw+'/'+seg.length).padStart(16)}  `
    +`${nb.toFixed(1).padStart(4)}  ${area.toFixed(0).padStart(5)}マス`);
}

const tally=(key)=>{
  const c={};
  for(const l of levels) c[l[key]]=(c[l[key]]||0)+1;
  return Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(' ');
};
const bigAt=levels.map((l,i)=>l.big?i+1:0).filter(Boolean);
console.log(`\n大きい面: ${bigAt.length}面 → ステージ ${bigAt.join(', ')}`);
if(bigAt.length){
  const bs=levels.filter(l=>l.big);
  const area=l=>(l.b.split('/')[0].length-2)*(l.b.split('/').length-2);
  console.log(`  広さ ${Math.min(...bs.map(area))}〜${Math.max(...bs.map(area))}マス / `
    +`手数 ${Math.min(...bs.map(l=>l.p))}〜${Math.max(...bs.map(l=>l.p))}手 / `
    +`荷物 ${Math.min(...bs.map(l=>(l.b.match(/[$*]/g)||[]).length))}〜${Math.max(...bs.map(l=>(l.b.match(/[$*]/g)||[]).length))}個`);
}
console.log('\n型の散らばり:');
console.log('  形      ', tally('sh'));
console.log('  大きさ  ', tally('sz'), '/ 縦横比', tally('ar'));
console.log('  仕切り  ', tally('cl'));
console.log('  置き場  ', tally('gp'));
console.log('  荷物配置', tally('sp'));
console.log('  人の位置', tally('pl'));
let same=0;
for(let i=1;i<levels.length;i++) if(levels[i].sh===levels[i-1].sh) same++;
console.log(`  隣り合う面で形が同じ: ${same}/${levels.length-1}組`);
