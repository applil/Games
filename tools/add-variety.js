'use strict';
/* 「形が変わっている面」を、型を指定して作り、campaign 全体に等間隔で置くツール。
 *
 *   node tools/add-variety.js [levels.json]
 *
 * 置く先は、いま bigKind:'odd' が付いている面と、足りないぶんを等間隔で補った枠。
 * どの枠も、素直な手筋3種が全滅し、一本道か置き場どけが要る面しか採らない。
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {solvableStates, regionRep, greedyPolicies, analyse, mulberry32}=E;
const S=require(path.join(__dirname,'shapes.js'));
const {toXSB, canonical, hashId}=require(path.join(__dirname,'xsb.js'));

const TARGET=process.argv[2]||path.join(__dirname,'..','warehouse','levels.json');
const SEED=+(process.argv[3]||20260812);
const STATE_CAP=200000;

/* ================= 作りたい型 ================= */
// size は shapes.js の SIZE_RANGE の名前。aspect は縦横比の強制。
const RECIPES=[
  {label:'小さくて難しい', n:3, shape:null,      size:['小','中'],       maxSide:5,  boxes:[3,4], trap:0.40},
  {label:'メガネ',         n:3, shape:'メガネ',   size:['大','特大'],     maxSide:11, boxes:[2,3], trap:0.22},
  {label:'縦にすごく長い', n:3, shape:null,      size:['特大','超特大'], maxSide:14, boxes:[2,3], trap:0.22, tall:true},
  {label:'十字星',         n:2, shape:'十字星',   size:['特大','超特大'], maxSide:12, boxes:[2,3], trap:0.22},
  {label:'難しい迷路',     n:3, shape:'迷路',     size:['大','特大'],     maxSide:10, boxes:[3],   trap:0.30},
  {label:'QRコード',       n:3, shape:'QRコード', size:['大','特大'],     maxSide:10, boxes:[3],   trap:0.28},
  {label:'連結回廊',       n:2, shape:'連結回廊', size:['特大','超特大'], maxSide:12, boxes:[2,3], trap:0.22},
];
const TOTAL=RECIPES.reduce((a,r)=>a+r.n,0);

const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));
const N=data.levels.length;

/* ================= 置く枠を決める ================= */
// いまある「形が変」の枠を活かしつつ、等間隔になるよう足す
const existing=[];
data.levels.forEach((l,i)=>{ if(l.bigKind==='odd') existing.push(i); });
const slots=[];
for(let k=0;k<TOTAL;k++){
  const want=Math.round((k+0.5)*N/TOTAL);
  // 近くに元の枠があればそれを使う
  let best=-1, bestD=Infinity;
  for(const e of existing){
    if(slots.includes(e)) continue;
    const d=Math.abs(e-want);
    if(d<bestD){ bestD=d; best=e; }
  }
  let at = (bestD<=12 && best>=0) ? best : want;
  while(at<4 || slots.includes(at)) at++;
  slots.push(at);
}
slots.sort((a,b)=>a-b);

const near=(i,pick)=>{
  const v=[];
  for(let j=Math.max(0,i-6); j<=Math.min(N-1,i+6); j++){ if(j!==i) v.push(pick(data.levels[j])); }
  v.sort((a,b)=>a-b);
  return v[v.length>>1];
};

/* ================= 候補づくり ================= */
const seen=new Set(data.levels.map(l=>canonical(l.b.split('/'))));
const rng=mulberry32(SEED);

function harvestOne(rc){
  const sizeName=rc.size[rng()*rc.size.length|0];
  const sh = rc.shape ? S.SHAPES.find(x=>x.name===rc.shape) : null;
  let W,H;
  if(rc.tall){                                   // 縦に細長く
    const r=S.SIZE_RANGE[sizeName];
    H=r[0]+((rng()*(r[1]-r[0]+1))|0);
    W=Math.max(3, Math.round(H*(0.22+rng()*0.18)));
  }else{
    const r=S.pickSize(rng, sh?sh.min[0]:3, sh?sh.min[1]:3, sizeName);
    W=r.W; H=r.H;
  }
  const shape = sh || S.SHAPES[rng()*S.SHAPES.length|0];
  if(W<shape.min[0]||H<shape.min[1]) return null;
  const L=shape.build(rng,W,H);
  L.shape=shape.name;
  if(rc.trap>=0.35) S.crop && null;              // 小さい面は仕切りを足さない
  else S.SHAPES && null;
  if(!S.keepLargest(L)) return null;
  const layout=S.crop(L);
  if(!layout) return null;
  layout.size=sizeName; layout.clutter=L.clutter||'ふつう';
  layout.aspect = layout.W===layout.H?'正方':(layout.W>layout.H?'横長':'縦長');
  if(layout.W>rc.maxSide||layout.H>rc.maxSide) return null;
  if(rc.maxSide<=5 && (layout.W>5||layout.H>5)) return null;
  if(rc.tall && layout.H < layout.W*2) return null;

  const floors=[];
  for(let i=0;i<layout.grid.length;i++) if(!layout.grid[i]) floors.push(i);
  const nbox=rc.boxes[rng()*rc.boxes.length|0];
  if(floors.length<nbox*3+2||floors.length>95) return null;
  if(nbox>=4 && floors.length>26) return null;   // 全状態が増えすぎる組み合わせは避ける
  if(nbox>=3 && floors.length>60) return null;

  const gp=S.pickGoals(layout, floors, nbox, rng);
  if(!gp) return null;
  const goals=gp.goals;
  const dist=solvableStates(layout.grid, layout.w, goals, STATE_CAP);
  if(!dist) return null;
  const policies=greedyPolicies(layout.grid, layout.w, goals);

  const cands=[];
  for(const [k,d] of dist){
    if(d<6||d>26) continue;
    const rep=k.charCodeAt(0);
    const boxes=[];
    for(let i=1;i<k.length;i++) boxes.push(k.charCodeAt(i));
    cands.push({boxes,rep,d});
  }
  if(!cands.length) return null;
  cands.sort((a,b)=>b.d-a.d);
  const deep=cands.slice(0, Math.max(8, cands.length>>2));

  for(let t=0;t<26;t++){
    const c=deep[rng()*deep.length|0];
    const r=regionRep(layout.grid, layout.w, new Set(c.boxes), c.rep);
    const a=analyse(layout.grid, layout.w, goals, dist,
                    {boxes:c.boxes, rep:c.rep, cells:r.cells}, rng, policies);
    if(!a) continue;
    if(a.greedyDied<3) continue;
    if(!(a.forced>=2||a.offGoal)) continue;
    if(a.trapRatio<rc.trap) continue;
    const rows=toXSB({grid:layout.grid, w:layout.w, h:layout.h, boxes:c.boxes, goals, player:c.rep});
    const key=canonical(rows);
    if(seen.has(key)) continue;
    seen.add(key);
    return {
      id:hashId(key), b:rows.join('/'), p:a.pushes,
      s:+a.score.toFixed(1), k:+a.score.toFixed(1),
      tr:Math.round(a.trapRatio*100), f:a.forced, g:a.greedyDied, og:a.offGoal?1:0,
      sh:layout.shape, sz:sizeName, ar:layout.aspect, gp:gp.pattern,
      sp:'-', pl:'-', cl:layout.clutter, st:dist.size,
      big:1, bigKind:'odd', variety:rc.label,
    };
  }
  return null;
}

/* ================= 型ごとに集めて、枠へ ================= */
const pools={};
const t0=Date.now();
for(const rc of RECIPES){
  const want=rc.n*4;                             // 枠数の4倍集めてから選ぶ
  const got=[];
  let tries=0;
  while(got.length<want && tries<want*900){
    tries++;
    const lv=harvestOne(rc);
    if(lv) got.push(lv);
  }
  pools[rc.label]=got;
  console.log(`${rc.label.padEnd(9)} 候補 ${got.length}面 / 試行 ${tries}回 / ${((Date.now()-t0)/1000).toFixed(0)}秒`);
}

// 型を順に散らして枠へ割り当てる(同じ型が隣り合わないように)
const order=[];
{
  const left=RECIPES.map(r=>({label:r.label, n:r.n}));
  while(order.length<TOTAL){
    left.sort((a,b)=>b.n-a.n);
    for(const r of left){ if(r.n>0){ order.push(r.label); r.n--; break; } }
    // 残りの多い型から順に取るので、自然に散る
    left.sort((a,b)=>b.n-a.n);
    if(left[0].n>0 && order.length<TOTAL){ order.push(left[0].label); left[0].n--; }
  }
}

let done=0, missed=[];
slots.forEach((slot,k)=>{
  const label=order[k];
  const pool=pools[label]||[];
  if(!pool.length){ missed.push(label); return; }
  const push=near(slot,l=>l.p), trap=near(slot,l=>l.tr);
  let best=0, bestCost=Infinity;
  pool.forEach((c,i)=>{
    const cost=Math.abs(c.p-push)*1.2+Math.abs(c.tr-trap)*0.07;
    if(cost<bestCost){ bestCost=cost; best=i; }
  });
  const now=pool.splice(best,1)[0];
  const old=data.levels[slot];
  data.levels[slot]=now;
  const os=old.b.split('/'), ns=now.b.split('/');
  console.log(`第${String(slot+1).padStart(3)}面 [${label}] ${os[0].length}x${os.length} ${old.p}手 罠${old.tr}%`
    +`  →  ${ns[0].length}x${ns.length} ${now.p}手 罠${now.tr}% 詰む${now.g}/3 一本道${now.f} どけ${now.og} ${now.sh}`);
  done++;
});

fs.writeFileSync(TARGET, JSON.stringify(data));
console.log(`\n${TARGET} を更新しました (${done}面を差し替え)`);
if(missed.length) console.log('候補が作れなかった型: '+missed.join(', '));
