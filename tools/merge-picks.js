'use strict';
/* よりぬき版の面を、本編の難易度カーブに合わせて差し込むツール。
 *
 *   node tools/merge-picks.js [levels.json] [levels-picks.json]
 *
 * 置き換えではなく挿入なので、本編の面数はよりぬきのぶんだけ増える。
 * 差し込む位置は、その面の手応えが本編のどのあたりに当たるかで決める。
 * 同じところに固まらないよう、間隔もあける。
 */
const fs=require('fs');
const path=require('path');
const X=require(path.join(__dirname,'xsb.js'));

const TARGET=process.argv[2]||path.join(__dirname,'..','warehouse','levels.json');
const PICKS =process.argv[3]||path.join(__dirname,'..','warehouse','levels-picks.json');
const KEEP_HEAD=4;        // チュートリアルの手前には入れない
const MIN_GAP=2;          // 差し込んだ面どうしは、これだけ離す

const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));
const picks=JSON.parse(fs.readFileSync(PICKS,'utf8')).levels;

// 手応えの目安。手数・罠率・素直に詰むか・一本道・置き場どけ を合わせた1つの数
const diffOf=l => l.p + l.tr*0.10 + (l.g||0)*1.2 + Math.min(l.f||0,4)*0.8 + (l.og?1.2:0);

// 本編のカーブをならす(1面ずつのばらつきを消して、位置を引けるようにする)
const curve=(()=>{
  const raw=data.levels.map(diffOf);
  const W=12, out=[];
  for(let i=0;i<raw.length;i++){
    let s=0,n=0;
    for(let j=Math.max(0,i-W); j<=Math.min(raw.length-1,i+W); j++){ s+=raw[j]; n++; }
    out.push(s/n);
  }
  // 単調に均す(後ろほど難しい、を保つ)
  for(let i=1;i<out.length;i++) if(out[i]<out[i-1]) out[i]=out[i-1];
  return out;
})();

const seen=new Set(data.levels.map(l=>X.canonical(l.b.split('/'))));
const list=[];
for(const p of picks){
  const key=X.canonical(p.b.split('/'));
  if(seen.has(key)) continue;                       // すでに本編にある盤は飛ばす
  seen.add(key);
  const d=diffOf(p);
  // カーブ上で、その手応えに追いつく最初の面
  let at=curve.findIndex(v=>v>=d);
  if(at<0) at=curve.length;
  list.push({lv:p, d, at:Math.max(KEEP_HEAD, at)});
}
list.sort((a,b)=>a.at-b.at||a.d-b.d);

// 固まらないよう間隔をあける(前から詰めていく)
let last=-Infinity;
for(const it of list){
  if(it.at<last+MIN_GAP) it.at=last+MIN_GAP;
  last=it.at;
}
// 後ろにはみ出したぶんは、前へ押し戻す
const over=last-(data.levels.length-1);
if(over>0){
  for(let i=list.length-1;i>=0;i--){
    const cap=(i+1<list.length ? list[i+1].at-MIN_GAP : data.levels.length-1);
    if(list[i].at>cap) list[i].at=Math.max(KEEP_HEAD, cap);
  }
}

// 後ろから入れると、前の面の位置がずれない
const out=data.levels.slice();
for(let i=list.length-1;i>=0;i--){
  const it=list[i];
  const lv=Object.assign({}, it.lv, {sh:it.lv.sh||'よりぬき', pick:1});
  out.splice(Math.min(it.at, out.length), 0, lv);
}
data.levels=out;
data.count=out.length;
fs.writeFileSync(TARGET, JSON.stringify(data));

const at=list.map(it=>it.at);
console.log(`よりぬき ${list.length}面を差し込みました (${out.length-list.length}面 → ${out.length}面)`);
console.log(`差し込んだ位置: ${at[0]} 〜 ${at[at.length-1]}`);
const bands=[];
for(let a=1;a<=out.length;a+=50){
  const b=Math.min(a+49,out.length);
  const n=out.slice(a-1,b).filter(l=>l.pick).length;
  bands.push(`${a}-${b}: ${n}面`);
}
console.log('50面ごとの本数: '+bands.join(' / '));
