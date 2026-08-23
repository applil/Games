'use strict';
/* パックの面を間引く。
 *
 *   node tools/thin-pack.js <名前> [1つの手数で残す上限]
 *   node tools/thin-pack.js spring 2
 *
 * いくつもの担当を同時に走らせて集めると、
 *   ・同じ手数の面ばかりが並ぶ(手応えが平らになる)
 *   ・担当をまたいだ重複(手順の重なり)は誰も見ていない
 * の2つが起きる。ここで両方を落として `<名前>-raw.json` を書き直す。
 * 元は `<名前>-raw.bak.json` に残す。
 *
 * 重なりの見かたは生成器と同じ。最短手順の「どの荷物をどこへ押したか」の
 * 集合をつくり、重なり(共通/合わせて)が threshold 以上なら同じ面とみなす。
 */
const fs=require('fs');
const path=require('path');
const {RULES}=require(path.join(__dirname,'..','warehouse','rules.js'));

const NAME=process.argv[2];
const PER=+(process.argv[3]||2);
const DUP=+(process.env.DUP||0.7);
if(!NAME){ console.error('使い方: node tools/thin-pack.js <名前> [1つの手数で残す上限]'); process.exit(1); }

const DIR=path.join(__dirname,'..','warehouse','packs');
const RAW=path.join(DIR,NAME+'-raw.json');
const data=JSON.parse(fs.readFileSync(RAW,'utf8'));
const rule=RULES[data.rule];
if(!rule){ console.error('知らないルール: '+data.rule); process.exit(1); }

/* 最短手順の押し手。盤の座標そのままで見るので、同じ部屋の別解は別物になる */
function pushSet(b, cap){
  const p=rule.parse(b);
  let layer=[{st:rule.start(p), path:[]}];
  const seen=new Set([rule.key(layer[0].st)]);
  for(let d=0; d<=cap; d++){
    for(const n of layer) if(rule.solved(p,n.st)) return n.path;
    const next=[];
    for(const n of layer) for(const m of rule.moves(p,n.st)){
      const k=rule.key(m.st);
      if(seen.has(k)) continue;
      seen.add(k);
      const yx=i=>Math.floor(i/p.w)+','+(i%p.w);
      next.push({st:m.st, path:n.path.concat(yx(m.box)+'>'+yx(m.to))});
    }
    if(!next.length) return null;
    layer=next;
  }
  return null;
}
const overlap=(A,B)=>{
  if(!A||!B) return 0;
  const sa=new Set(A), sb=new Set(B);
  let n=0; for(const v of sa) if(sb.has(v)) n++;
  const u=sa.size+sb.size-n;
  return u? n/u : 0;
};

/* 同じ手数の中では、種類の違うものを先に取る。
   そうしないと、上限で切ったときに片方の種類ばかりが残る
   (印あわせで、印の付き方が違う面が全部落ちた)。
   種類の見かたは「荷物の数と、そのうち印が付いている数」 */
function kindOf(lv){
  const nb=(lv.b.match(/[1-9$*]/g)||[]).length;
  const nm=(lv.b.match(/[1-9]/g)||[]).length;
  return nm+'/'+nb;
}
function order(list){
  const byP={};
  for(const lv of list) (byP[lv.p]=byP[lv.p]||[]).push(lv);
  const out=[];
  for(const p of Object.keys(byP).map(Number).sort((a,b)=>a-b)){
    const byKind={};
    for(const lv of byP[p]) (byKind[kindOf(lv)]=byKind[kindOf(lv)]||[]).push(lv);
    // 珍しい種類から順に、1つずつ取っていく
    const kinds=Object.keys(byKind).sort((a,b)=>byKind[a].length-byKind[b].length);
    let left=byP[p].length;
    while(left>0) for(const k of kinds){
      const lv=byKind[k].shift();
      if(lv){ out.push(lv); left--; }
    }
  }
  return out;
}
const levels=order(data.levels.slice());
const kept=[], sets=[], count={};
const dropped=[];
for(const lv of levels){
  // 上限は「同じ手数で、同じ種類のもの」に対して数える。
  // 手数だけで数えると、数の多い種類が枠を食いつぶす
  const key=lv.p+'|'+kindOf(lv);
  if((count[key]||0)>=PER){ dropped.push([lv,'同じ'+lv.p+'手・同じ種類が多い']); continue; }
  const ps=pushSet(lv.b, lv.p+1);
  let twin=null;
  for(let i=0;i<sets.length;i++) if(overlap(ps,sets[i])>=DUP){ twin=kept[i]; break; }
  if(twin){ dropped.push([lv,'手順が '+twin.id+' と重なる']); continue; }
  kept.push(lv); sets.push(ps);
  count[key]=(count[key]||0)+1;
}

fs.copyFileSync(RAW, path.join(DIR,NAME+'-raw.bak.json'));
fs.writeFileSync(RAW, JSON.stringify({rule:data.rule, levels:kept}, null, 1));
console.log(`${levels.length}面 → ${kept.length}面`);
for(const [lv,why] of dropped) console.log(`  外した ${lv.id} (${lv.p}手) — ${why}`);
console.log('手数: '+kept.map(l=>l.p).join(' '));
