'use strict';
/* 全1000面の「素直に解ける」判定。
 *
 *   node tools/scan-naive.js [levels.json]
 *
 * ラベル104面で一番強かった信号。置き場に近づいて見える押し手だけを繋いで
 * 解けてしまう面は、16面中15面(94%)が ✕ だった。
 * 全局面の表が要らないので、深い面でも一瞬で測れる。
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {regionRep}=E;
const {goalDist}=require(path.join(__dirname,'astar.js'));
const {naiveSolvable}=require(path.join(__dirname,'deep.js'));

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
      grid[i]=0;
      if(c==='$'||c==='*') boxes.push(i);
      if(c==='.'||c==='*'||c==='+') goals.push(i);
      if(c==='@'||c==='+') player=i;
    }
  }
  return {grid,w,h,boxes:boxes.sort((a,b)=>a-b),goals:goals.sort((a,b)=>a-b),player};
}

const hit=[];
const t0=Date.now();
data.levels.forEach((lv,i)=>{
  const p=parse(lv.b);
  const gd=p.goals.map(g=>goalDist(p.grid,p.w,g));   // 置き場ごとに1枚ずつ
  const r0=regionRep(p.grid,p.w,new Set(p.boxes),p.player);
  if(naiveSolvable(p.grid,p.w,p.goals,gd,p.boxes,r0.rep)) hit.push({at:i+1, id:lv.id, p:lv.p, nbox:lv.nbox, mano:lv.mano});
});

const sec=((Date.now()-t0)/1000).toFixed(1);
console.log(`${data.levels.length}面を判定 (${sec}秒)`);
console.log(`素直に解ける面: ${hit.length}面 (${(hit.length/data.levels.length*100).toFixed(1)}%)`);
const bands=[[1,300],[301,600],[601,800],[801,1000]];
for(const [a,b] of bands){
  const n=hit.filter(x=>x.at>=a&&x.at<=b).length;
  console.log(`  第${a}〜${b}面: ${n}面 (${(n/(b-a+1)*100).toFixed(1)}%)`);
}
console.log('\n301面以降の該当:');
hit.filter(x=>x.at>300).forEach(x=>
  console.log(`  第${x.at}面 (${x.id}) ${x.p}手 荷物${x.nbox} ズレ${(x.mano||0).toFixed(2)}`));

fs.writeFileSync(path.join(__dirname,'stock','naive.json'), JSON.stringify(hit,null,1));
console.log('\ntools/stock/naive.json に書き出しました');
