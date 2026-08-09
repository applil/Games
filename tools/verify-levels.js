'use strict';
/* levels.json の全件検証。
 *   ・ID の重複がないか
 *   ・盤面として成立しているか(荷物と置き場の数が一致 / 人がいる / 床がつながっている)
 *   ・記録されている最短手数どおりに解けるか
 * 検証には枝刈りなしの前向きBFSを使い、生成器とは別経路で確かめる。
 *
 *   node tools/verify-levels.js [levels.json]
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {regionRep, pushesFrom, keyOf}=E;

const FILE=process.argv[2]||path.join(__dirname,'..','warehouse','levels.json');
const data=JSON.parse(fs.readFileSync(FILE,'utf8'));

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
let bad=0, checked=0;
const t0=Date.now();
data.levels.forEach((lv,i)=>{
  const where=`第${i+1}面 (${lv.id})`;
  if(ids.has(lv.id)){ console.log(`${where}: IDが重複`); bad++; }
  ids.add(lv.id);
  let p;
  try{ p=parse(lv.b); }
  catch(e){ console.log(`${where}: 盤面を読めない — ${e.message}`); bad++; return; }
  if(p.player<0){ console.log(`${where}: 人がいない`); bad++; return; }
  if(p.boxes.length!==p.goals.length){ console.log(`${where}: 荷物${p.boxes.length}個 置き場${p.goals.length}個`); bad++; return; }
  if(!p.boxes.length){ console.log(`${where}: 荷物がない`); bad++; return; }
  if(!connected(p)){ console.log(`${where}: 床が分断されている`); bad++; return; }
  if(p.boxes.every(b=>p.goals.includes(b))){ console.log(`${where}: 最初から完成している`); bad++; return; }
  const d=forwardSolve(p);
  checked++;
  if(d===null){ console.log(`${where}: 解けない`); bad++; return; }
  if(d!==lv.p){ console.log(`${where}: 記録${lv.p}手 実測${d}手`); bad++; }
});

const sec=((Date.now()-t0)/1000).toFixed(1);
console.log(`\n${data.levels.length}面 / ID重複なし:${ids.size===data.levels.length} / 前向きBFSで${checked}面を検証 (${sec}秒)`);
console.log(bad ? `❌ ${bad}件の問題` : '✅ 全件で問題なし — すべて解けて、最短手数も記録と一致');
process.exit(bad?1:0);
