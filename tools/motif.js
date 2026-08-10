'use strict';
/* 「置き場の並び」だけを取り出した署名。
 *
 * 盤の文字列や局面グラフが違っても、置き場が同じ形に並んでいて
 * 同じ位置が最初から埋まっていれば、遊ぶ人には同じ問題に見える。
 * 壁の飾りをいくら変えても、この署名は変わらない。
 */
const path=require('path');
const X=require(path.join(__dirname,'xsb.js'));

function goalMotif(board){
  const p=X.fromXSB(board.split('/'));
  const gs=p.goals;
  const ys=gs.map(c=>Math.floor(c/p.w)), xs=gs.map(c=>c%p.w);
  const y0=Math.min(...ys), y1=Math.max(...ys), x0=Math.min(...xs), x1=Math.max(...xs);
  const rows=[];
  for(let y=y0;y<=y1;y++){ let r='';
    for(let x=x0;x<=x1;x++){ const i=y*p.w+x;
      r += gs.includes(i) ? (p.boxes.includes(i)?'*':'.') : '#'; }
    rows.push(r); }
  return String(X.canonical(rows))+'/n'+p.boxes.length;
}
module.exports={goalMotif};

if(require.main===module){
  const fs=require('fs');
  const L=JSON.parse(fs.readFileSync(path.join(__dirname,'..','warehouse','levels.json'),'utf8')).levels;
  const g=new Map();
  L.forEach((l,i)=>{ let m; try{ m=goalMotif(l.b); }catch(e){ return; }
    if(!g.has(m)) g.set(m,[]); g.get(m).push(i+1); });
  const rows=[...g.entries()].sort((a,b)=>b[1].length-a[1].length);
  console.log('置き場の並びの種類: '+rows.length+'通り / 全'+L.length+'面\n');
  console.log('多い順');
  for(const [m,at] of rows.slice(0,15))
    console.log(String(at.length).padStart(4)+'面  '+m.replace(/\/n/,'  荷物').padEnd(28)+'  例: 第'+at.slice(0,6).join(',第')+'面');
}
