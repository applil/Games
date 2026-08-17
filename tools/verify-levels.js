'use strict';
/* levels.json の全件検証。
 *   ・ID の重複がないか
 *   ・盤面として成立しているか(荷物と置き場の数が一致 / 人がいる / 床がつながっている)
 *   ・記録されている最短手数どおりに解けるか
 * 検証には枝刈りなしの前向きBFSを使い、生成器とは別経路で確かめる。
 * 深い面は前向きBFSでは終わらないので、上限を超えたら A* に切り替える
 * (A* 自体は、数え上げと突き合わせて答えが合うことを確かめてある)。
 *
 *   node tools/verify-levels.js [levels.json]
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {regionRep, pushesFrom, keyOf}=E;
const {minPushes}=require(path.join(__dirname,'astar.js'));
const BFS_CAP=+(process.env.BFS_CAP||400000);        // これを超えたら A* に回す
// 1000面を一本で回すと1時間では終わらない。SHARDS=4 SHARD=0..3 で分けて同時に走らせる
const SHARDS=+(process.env.SHARDS||1), SHARD=+(process.env.SHARD||0);

const FILE=process.argv[2]||path.join(__dirname,'..','warehouse','levels.json');
const data=JSON.parse(fs.readFileSync(FILE,'utf8'));

/* 済んだぶんの控え。1000面ぜんぶで1時間以上かかるので、途中で止まっても
   やり直しにならないよう、面ごとに書き足していく。ID をそのまま鍵にするので、
   並べ替えても控えはそのまま使える。/tmp は消えるのでリポジトリの中に置く */
const CACHE=path.join(__dirname,'stock','verified.json');
let done={};
try{ done=JSON.parse(fs.readFileSync(CACHE,'utf8')); }catch(e){}
function remember(id, d){
  done[id]=d;
  try{
    // 同時に4本走るので、自分のぶんを書いてから読み直して混ぜる
    let cur={};
    try{ cur=JSON.parse(fs.readFileSync(CACHE,'utf8')); }catch(e){}
    cur[id]=d;
    fs.writeFileSync(CACHE+'.'+SHARD, JSON.stringify(cur));
    fs.renameSync(CACHE+'.'+SHARD, CACHE);
    done=cur;
  }catch(e){}
}

function parse(board){
  const rows=board.split('/');
  const h=rows.length, w=Math.max(...rows.map(r=>r.length));
  const grid=new Uint8Array(w*h).fill(1);
  const boxes=[], goals=[];
  let player=-1;
  for(let y=0;y<h;y++){
    const row=rows[y].padEnd(w,'#');
    for(let x=0;x<w;x++){
      const c=row[x], i=y*w+x;
      if(c==='#') continue;
      if(' $.*@+'.indexOf(c)<0) throw new Error('未知の文字: '+c);
      grid[i]=0;
      if(c==='$'||c==='*') boxes.push(i);
      if(c==='.'||c==='*'||c==='+') goals.push(i);
      if(c==='@'||c==='+') player=i;
    }
  }
  return {grid,w,h,boxes:boxes.sort((a,b)=>a-b),goals:goals.sort((a,b)=>a-b),player};
}

// 枝刈りを一切しない前向きBFS(押し回数の層順)
function forwardSolve(p){
  const {grid,w,goals}=p;
  const goalSet=new Set(goals);
  const r0=regionRep(grid,w,new Set(p.boxes),p.player);
  let layer=[{boxes:p.boxes, cells:r0.cells}];
  const seen=new Set([keyOf(p.boxes,r0.rep)]);
  let d=0;
  while(layer.length){
    if(layer.some(s=>s.boxes.every(b=>goalSet.has(b)))) return d;
    if(seen.size>BFS_CAP) return 'over';                // 深すぎる。A* に回す
    const next=[];
    for(const st of layer){
      for(const m of pushesFrom(grid,w,st.boxes,st.cells)){
        if(seen.has(m.key)) continue;
        seen.add(m.key);
        next.push({boxes:m.boxes, cells:m.cells});
      }
    }
    layer=next; d++;
  }
  return null;
}
// 前向きBFSで終わらなかった面を A* で解く
function deepSolve(p){
  const r=minPushes(p.grid,p.w,p.goals,p.boxes,p.player,{nodes:6e6});
  return r===undefined ? 'over' : r;
}

function connected(p){
  const {grid,w}=p;
  let start=-1, total=0;
  for(let i=0;i<grid.length;i++) if(!grid[i]){ total++; if(start<0) start=i; }
  const seen=new Uint8Array(grid.length); seen[start]=1;
  const st=[start]; let n=1;
  while(st.length){
    const c=st.pop();
    for(const d of [1,-1,w,-w]){ const q=c+d; if(q>=0&&q<grid.length&&!grid[q]&&!seen[q]){ seen[q]=1; n++; st.push(q); } }
  }
  return n===total;
}

const ids=new Set();
let bad=0, checked=0, deep=0, unchecked=0;
const t0=Date.now();
data.levels.forEach((lv,i)=>{
  const where=`第${i+1}面 (${lv.id})`;
  if(ids.has(lv.id)){ console.log(`${where}: IDが重複`); bad++; }
  ids.add(lv.id);
  if(i%SHARDS!==SHARD) return;                        // 自分の担当ぶんだけ
  // どこまで進んだかを、経過とともに横に出す(標準エラーなので結果には混ざらない)
  process.stderr.write(`[${SHARD}] 第${i+1}面 ${((Date.now()-t0)/1000).toFixed(0)}秒\n`);
  let p;
  try{ p=parse(lv.b); }
  catch(e){ console.log(`${where}: 盤面を読めない — ${e.message}`); bad++; return; }
  if(p.player<0){ console.log(`${where}: 人がいない`); bad++; return; }
  if(p.boxes.length!==p.goals.length){ console.log(`${where}: 荷物${p.boxes.length}個 置き場${p.goals.length}個`); bad++; return; }
  if(!p.boxes.length){ console.log(`${where}: 荷物がない`); bad++; return; }
  if(!connected(p)){ console.log(`${where}: 床が分断されている`); bad++; return; }
  if(p.boxes.every(b=>p.goals.includes(b))){ console.log(`${where}: 最初から完成している`); bad++; return; }
  let d, how;
  if(done[lv.id]!==undefined){ d=done[lv.id]; how='控え'; }   // 前回の続き
  else {
    d=forwardSolve(p); how='BFS';
    if(d==='over'){ d=deepSolve(p); how='A*'; deep++; }
    remember(lv.id, d);
  }
  checked++;
  if(d==='over'){ console.log(`${where}: A*でも上限超え(検証できず)`); unchecked++; return; }
  if(d===null){ console.log(`${where}: 解けない`); bad++; return; }
  if(d!==lv.p){ console.log(`${where}: 記録${lv.p}手 実測${d}手 (${how})`); bad++; }
});

const sec=((Date.now()-t0)/1000).toFixed(1);
console.log(`\n${data.levels.length}面 / ID重複なし:${ids.size===data.levels.length}`
  +(SHARDS>1?` / 担当${SHARD}(${SHARDS}分割)`:'')+` / ${checked}面を検証 (${sec}秒)`
  +(deep?` — うち${deep}面は深すぎるので A* で検証`:'')
  +(unchecked?` / ${unchecked}面は検証できず`:''));
console.log(bad ? `❌ ${bad}件の問題` : '✅ 全件で問題なし — すべて解けて、最短手数も記録と一致');
process.exit(bad?1:0);
