'use strict';
/* 401面以降の並べ直し。同じ手数の中だけを、終盤の回り込みの少ない順にする。
 *
 *   node tools/reorder-401.js [--write]
 *
 * いままで並び順を決めていたのは手数だけだった。そのため同じ手数の面が
 * 延々と続く区間(801-900面は45手が40面連続)では、中身が実質ばらばらだった。
 *
 * 「終盤の回り込み ÷ 床」(tools/scan-latewalk.js)は手数との相関が0.54しかなく、
 * 半分は手数と別の情報を持っている。同じ手数の40面でも0.54〜2.43と4.5倍開く。
 * これを使って、平坦な区間に「素直な面 → 回り込みの多い面」の流れを作る。
 *
 * 各位置の手数はまったく動かさないので、章ごとの中央値も、章の境目も、
 * 山(飛び抜けて重い面)の位置も変わらない。入れ替わるのは中身だけ。
 *
 * 第400面までは tools/frozen.js の線で守られていて、触らない。
 */
const fs=require('fs');
const path=require('path');
const {FROZEN}=require(path.join(__dirname,'frozen.js'));

const FILE=path.join(__dirname,'..','warehouse','levels.json');
const data=JSON.parse(fs.readFileSync(FILE,'utf8'));
const L=data.levels;
if(L.length!==1000) throw new Error('1000面ではありません: '+L.length);

// 測定結果を読む。担当ごとに分かれているので混ぜる
const STOCK=path.join(__dirname,'stock');
const M={};
for(const f of fs.readdirSync(STOCK)){
  if(!/^latewalk(\.\d+)?\.json$/.test(f)) continue;
  Object.assign(M, JSON.parse(fs.readFileSync(path.join(STOCK,f),'utf8')));
}
const lwOf=lv=>{ const v=M[lv.id]; return v&&typeof v.lw==='number' ? v.lw : null; };
const missing=L.slice(FROZEN).filter(lv=>lwOf(lv)===null);
if(missing.length) throw new Error(`回り込みが測れていない面が${missing.length}あります。先に tools/scan-latewalk.js を回してください`);

// 山の位置。ここは動かさない
const SLOT=[9,27,48,66,91];
const spike=new Set();
for(let b=300;b<800;b+=100) SLOT.forEach(s=>spike.add(b+s));

// 動かしてよい位置を、手数ごとにまとめる
const groups=new Map();
for(let i=FROZEN;i<L.length;i++){
  if(spike.has(i)) continue;
  const p=L[i].p;
  if(!groups.has(p)) groups.set(p,[]);
  groups.get(p).push(i);
}

const beforeP=L.map(x=>x.p);
let moved=0;
for(const [p, idx] of groups){
  if(idx.length<2) continue;
  const items=idx.map(i=>L[i]);
  // 回り込みの少ない(素直な)順。同じなら荷物が少なく、盤が小さいほうを先に
  items.sort((a,b)=>
    lwOf(a)-lwOf(b)
    || (a.nbox||0)-(b.nbox||0)
    || (a.floors||0)-(b.floors||0)
    || (a.id<b.id?-1:a.id>b.id?1:0));
  idx.forEach((i,k)=>{ if(L[i]!==items[k]) moved++; L[i]=items[k]; });
}

// 各位置の手数がまったく変わっていないことを確かめる。
// ここが崩れると、章の中央値も境目も山の位置も狂う
for(let i=0;i<L.length;i++) if(L[i].p!==beforeP[i])
  throw new Error(`第${i+1}面の手数が変わりました ${beforeP[i]}→${L[i].p}`);
if(new Set(L.map(x=>x.id)).size!==1000) throw new Error('IDが重複しました');

console.log(`第${FROZEN+1}面以降で ${moved}面が入れ替わりました`);
console.log('\n--- 平坦だった区間が、どう並ぶようになったか ---');
for(const [a,b,pp] of [[401,500,16],[601,700,28],[801,900,45],[901,1000,51]]){
  const g=[];
  for(let i=a-1;i<b;i++) if(L[i].p===pp && !spike.has(i)) g.push(lwOf(L[i]));
  if(g.length<2) continue;
  const asc=g.every((v,i)=>i===0||v>=g[i-1]);
  console.log(`${a}-${b}の${pp}手 ${g.length}面: ${g[0].toFixed(2)} → ${g[g.length-1].toFixed(2)} ${asc?'(小さい順)':'❌並んでいない'}`);
}

if(process.argv.includes('--write')){
  fs.writeFileSync(FILE, JSON.stringify(data));
  console.log('\n書き出しました: '+FILE);
} else {
  console.log('\n(下見です。書き込むには --write を付けてください)');
}
