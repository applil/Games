'use strict';
/* 着せ替えのパックを組み立てる。
 *
 *   node tools/build-pack.js <名前>
 *   node tools/build-pack.js summer
 *
 * チュートリアルは手で作って検算したもの、本編は生成器が集めたもので、
 * 出どころが別々。生成器は自分のファイルを読み込んだまま持っているので、
 * 同じファイルに手で書き足すと、次に見つけた1面で上書きされて消える
 * (実際に一度消えた)。なので、
 *
 *   <名前>-tutorial.json … 手で作る。生成器は触らない
 *   <名前>-raw.json      … 生成器が書く。手では触らない
 *   <名前>.json          … この道具が2つを繋いで作る。遊ぶときに読むのはこれ
 *
 * と分けて、繋ぐのはこの道具だけにする。
 * 本編は手数の少ない順。チュートリアルは常に先頭。
 */
const fs=require('fs');
const path=require('path');
const {RULES}=require(path.join(__dirname,'..','warehouse','rules.js'));

const NAME=process.argv[2];
if(!NAME){ console.error('使い方: node tools/build-pack.js <名前>'); process.exit(1); }
const DIR=path.join(__dirname,'..','warehouse','packs');
const read=f=>{ try{ return JSON.parse(fs.readFileSync(path.join(DIR,f),'utf8')); }catch(e){ return null; } };

const tut=read(NAME+'-tutorial.json');
const raw=read(NAME+'-raw.json') || read(NAME+'.json');
if(!raw){ console.error(DIR+'/'+NAME+'-raw.json がありません'); process.exit(1); }
const ruleName=(tut&&tut.rule)||raw.rule;
const rule=RULES[ruleName];
if(!rule){ console.error('知らないルール: '+ruleName); process.exit(1); }

/* 記録してある手数どおりに解けるか、その場で確かめる */
function check(b, want){
  const p=rule.parse(b);
  if(p.boxes.length!==p.goals.length) return '荷物と置き場の数が合わない';
  if(p.player<0) return '人がいない';
  let layer=[rule.start(p)];
  const seen=new Set([rule.key(layer[0])]);
  for(let d=0; d<=want+2; d++){
    if(layer.some(s=>rule.solved(p,s))) return d===want ? null : `記録${want}手 実測${d}手`;
    const next=[];
    for(const st of layer) for(const m of rule.moves(p,st)){
      const k=rule.key(m.st); if(seen.has(k)) continue;
      seen.add(k); next.push(m.st);
    }
    if(!next.length) return '解けない';
    layer=next;
  }
  return `記録${want}手では解けない`;
}

const tutLv=(tut&&tut.levels)||[];
const seen=new Set(tutLv.map(l=>l.id));
const main=(raw.levels||[]).filter(l=>!seen.has(l.id)).sort((a,b)=>a.p-b.p);
const all=tutLv.concat(main);

let bad=0;
all.forEach((l,i)=>{
  const e=check(l.b, l.p);
  if(e){ console.log(`  ${i+1}面目 (${l.id}): ${e}`); bad++; }
});
if(new Set(all.map(l=>l.id)).size!==all.length){ console.error('IDが重複しています'); process.exit(1); }

fs.writeFileSync(path.join(DIR,NAME+'.json'),
  JSON.stringify({rule:ruleName, tutorial:tutLv.length, levels:all}, null, 1));
console.log(`${NAME}.json: チュートリアル${tutLv.length}面 + 本編${main.length}面 = ${all.length}面`);
console.log('手数: ' + all.map(l=>l.p).join(' '));
console.log(bad ? `❌ ${bad}件の問題` : '✅ 全件、記録した手数どおりに解ける');
process.exit(bad?1:0);
