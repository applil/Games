'use strict';
/* 同じ部屋の面どうしを探す道具。
 *
 *   node tools/find-twins.js
 *
 * 生成のときに落としているのは「盤面が完全に一致する面」だけだった。
 * ところが、壁と置き場が同じで荷物と人の位置だけ違う面は、
 * 遊ぶ側から見れば同じ部屋の別の局面でしかない。実際に第321面と第322面が
 * これで、どちらも12手、違うのは中央の数マスだけだった。
 *
 * ここでは「壁の形 + 置き場の位置」を鍵にして、同じ鍵の面をまとめる。
 * 向きの違い(回転4×鏡2)も同じ部屋とみなす。
 */
const fs=require('fs');
const path=require('path');

const FILE=process.argv[2]||path.join(__dirname,'..','warehouse','levels.json');
const L=JSON.parse(fs.readFileSync(FILE,'utf8')).levels;

// 壁と置き場だけを残した図。荷物と人は消す
function room(b){
  const rows=b.split('/');
  const h=rows.length, w=Math.max(...rows.map(r=>r.length));
  const g=[];
  for(let y=0;y<h;y++){
    const row=rows[y].padEnd(w,'#');
    g.push(row.split('').map(c=>{
      if(c==='#') return '#';
      if(c==='.'||c==='*'||c==='+') return '.';   // 置き場(荷物や人が乗っていても置き場)
      return ' ';
    }));
  }
  return g;
}
const rot=g=>{
  const h=g.length, w=g[0].length, o=[];
  for(let x=0;x<w;x++){ const r=[]; for(let y=h-1;y>=0;y--) r.push(g[y][x]); o.push(r); }
  return o;
};
const flip=g=>g.map(r=>r.slice().reverse());
const show=g=>g.map(r=>r.join('')).join('/');
// 8通りの向きのうち、文字列として一番小さいものを鍵にする
function roomKey(b){
  let c=room(b), best=null;
  for(let i=0;i<4;i++){
    for(const v of [c, flip(c)]){ const s=show(v); if(best===null||s<best) best=s; }
    c=rot(c);
  }
  return best;
}

const groups=new Map();
L.forEach((lv,i)=>{
  const k=roomKey(lv.b);
  if(!groups.has(k)) groups.set(k,[]);
  groups.get(k).push({at:i+1, id:lv.id, p:lv.p, b:lv.b});
});

const twins=[...groups.values()].filter(g=>g.length>1).sort((a,b)=>a[0].at-b[0].at);
const total=twins.reduce((n,g)=>n+g.length,0);
console.log(`同じ部屋の面: ${twins.length}組 / のべ${total}面 (${L.length}面中)`);
console.log('');
for(const g of twins){
  console.log('  ' + g.map(x=>`第${x.at}面(${x.p}手)`).join(' と ') + (g.every(x=>x.p===g[0].p)?'  ← 手数まで同じ':''));
}
const out=path.join(__dirname,'stock','twins.json');
try{ fs.mkdirSync(path.dirname(out),{recursive:true}); }catch(e){}
fs.writeFileSync(out, JSON.stringify(twins,null,1));
console.log('\n' + out + ' に書き出しました');
