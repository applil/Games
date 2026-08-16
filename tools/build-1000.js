'use strict';
/* 第301面から第1000面までを、決めた難易度の階段に並べ直すツール。
 *
 *   node tools/build-1000.js <深い面の在庫ディレクトリ> [levels.json]
 *   （--dry を付けると書き込まずに結果だけ出す）
 *
 * 決めごと:
 *   ・第1〜300面は触らない。遊んだ人がいるので順番も内容もそのまま
 *   ・第301面以降は、既存の面と新しい面を混ぜて並べ直してよい
 *   ・面のidは変えない。クリア履歴の自己ベストはidで持っているので残る
 *
 * 階段(1区間100面):
 *   土台は少しずつ重くしつつ、簡単な面も混ぜたままにする。
 *   そこへ100面あたり5面、その区間だけ飛び抜けて難しい面(跳ね)を置く。
 *   跳ねは区間が進むほど重くする。第800面からは全部が跳ね級。
 */
const fs=require('fs');
const path=require('path');

const POOL=process.argv[2]||'/tmp/pool';
const TARGET=process.argv.find(a=>a.endsWith('levels.json'))||path.join(__dirname,'..','warehouse','levels.json');
const DRY=process.argv.includes('--dry');

/* 区間ごとの設計。
     base  … 土台の目安手数
     floor … 土台の下限。これが無いと、簡単な面が後ろの区間まで流れてくる
     spike … 跳ねの下限
     spikes… 跳ねの数(区間の面数以上なら、その区間は全部が跳ね級) */
const BANDS=[
  {from:301, to:400,  base:14, floor:6,  spike:28, spikes:5},
  {from:401, to:500,  base:17, floor:8,  spike:34, spikes:5},
  {from:501, to:600,  base:20, floor:10, spike:40, spikes:5},
  {from:601, to:700,  base:24, floor:14, spike:46, spikes:5},
  {from:701, to:800,  base:28, floor:18, spike:52, spikes:5},
  {from:801, to:900,  base:45, floor:45, spike:45, spikes:100},
  {from:901, to:1000, base:48, floor:48, spike:48, spikes:100},
];
// 跳ねを置く位置(区間の何番目か)。等間隔だと身構えるので少しずらす
const SPIKE_SLOTS=[9, 27, 48, 66, 91];

const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));
const keep=data.levels.slice(0,300);             // 触らない
const pool=data.levels.slice(300);               // 並べ直してよい既存の面

// 在庫(新しく作った深い面)を読む
const fresh=[];
if(fs.existsSync(POOL)){
  for(const f of fs.readdirSync(POOL)){
    if(!f.endsWith('.json')) continue;
    for(const lv of JSON.parse(fs.readFileSync(path.join(POOL,f),'utf8'))) fresh.push(lv);
  }
}
// 重複を落とす(並列で作っているので、別プロセスが同じ盤を出すことがある)
const X=require(path.join(__dirname,'xsb.js'));
const MO=require(path.join(__dirname,'motif.js'));
const seenKey=new Set(data.levels.map(l=>String(X.canonical(l.b.split('/')))));
const seenMotif=new Set();
for(const l of data.levels){ try{ seenMotif.add(MO.goalMotif(l.b)); }catch(e){} }
const add=[];
for(const lv of fresh){
  const k=String(X.canonical(lv.b.split('/')));
  if(seenKey.has(k)) continue;
  const m=MO.goalMotif(lv.b);
  if(seenMotif.has(m)) continue;
  seenKey.add(k); seenMotif.add(m);
  delete lv.boxes; delete lv.rep;
  add.push(lv);
}

const all=pool.concat(add).sort((a,b)=>a.p-b.p);
console.log(`並べ直す対象 ${pool.length}面 + 新しい在庫 ${add.length}面 = ${all.length}面`);
console.log(`要る枠 ${BANDS[BANDS.length-1].to-300}面`);

// 手数の帯ごとに取り出せるようにする
const byPush=all.slice();
const takeNear=(target, floor)=>{                 // 目安にいちばん近いものを取る
  let bi=-1, bd=Infinity;
  for(let i=0;i<byPush.length;i++){
    if(floor && byPush[i].p<floor) continue;      // 下限より軽いものは、この区間では使わない
    const d=Math.abs(byPush[i].p-target);
    if(d<bd){ bd=d; bi=i; }
  }
  if(bi<0) return null;
  return byPush.splice(bi,1)[0];
};
const takeMax=()=>{                               // いちばん深いものを取る(最終面用)
  let bi=-1;
  for(let i=0;i<byPush.length;i++) if(bi<0||byPush[i].p>byPush[bi].p) bi=i;
  return bi<0 ? null : byPush.splice(bi,1)[0];
};
const takeAtLeast=min=>{                          // 下限以上でいちばん軽いものを取る
  let bi=-1;
  for(let i=0;i<byPush.length;i++) if(byPush[i].p>=min && (bi<0||byPush[i].p<byPush[bi].p)) bi=i;
  return bi<0 ? null : byPush.splice(bi,1)[0];
};

const out=[];
const missing=[];
for(const band of BANDS){
  const n=band.to-band.from+1;
  const spikeAt=new Set(band.spikes>=n ? [] : SPIKE_SLOTS.slice(0,band.spikes));
  for(let i=0;i<n;i++){
    const wantSpike = band.spikes>=n || spikeAt.has(i);
    let lv = wantSpike ? takeAtLeast(band.spike) : null;
    if(!lv && wantSpike) lv=takeAtLeast(band.spike-4);       // 少し譲る
    if(!lv && band.from+i===1000) lv=takeMax();                // 最終面はいちばん深いもの
    if(!lv){
      // 土台は、区間の中で軽い側から重い側へ緩やかに上げる
      const t=band.base + Math.round((i/n)*(band.base*0.35));
      lv=takeNear(t, band.floor) || takeNear(t);
    }
    if(!lv){ missing.push(band.from+i); continue; }
    out.push({lv, at:band.from+i, spike:wantSpike});
  }
}

console.log(`置けた ${out.length}面 / 足りない ${missing.length}面`);
if(missing.length) console.log(`  足りないのは 第${missing[0]}面〜第${missing[missing.length-1]}面`);
console.log(`使わなかった在庫 ${byPush.length}面`);

// 区間ごとの出来を出す
console.log('\n 区間        面数  手数(最小/中央/最大)  跳ね');
for(const band of BANDS){
  const seg=out.filter(o=>o.at>=band.from&&o.at<=band.to);
  if(!seg.length) continue;
  const ps=seg.map(o=>o.lv.p).sort((a,b)=>a-b);
  const sp=seg.filter(o=>o.spike).map(o=>o.at);
  console.log(String(band.from).padStart(4)+'〜'+String(band.to).padEnd(6)
    +String(seg.length).padStart(5)
    +('  '+ps[0]+' / '+ps[ps.length>>1]+' / '+ps[ps.length-1]).padEnd(22)
    +(sp.length>8?sp.length+'面':sp.join(',')));
}

if(DRY||missing.length){
  console.log('\n'+(DRY?'--dry なので書き込みません':'足りないので書き込みません(在庫を増やしてから)'));
  process.exit(missing.length?1:0);
}
data.levels=keep.concat(out.map(o=>o.lv));
data.levels.forEach((l,i)=>{ l.orig=i+1; });
data.count=data.levels.length;
fs.writeFileSync(TARGET, JSON.stringify(data));
console.log(`\n全${data.count}面 を書き出しました`);
