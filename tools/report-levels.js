'use strict';
/* 出来上がった面の並びを、区間ごとに眺めるためのツール。
 *
 *   node tools/report-levels.js [levels.json]
 */
const fs=require('fs');
const path=require('path');
const FILE=process.argv[2]||path.join(__dirname,'..','warehouse','levels.json');
const data=JSON.parse(fs.readFileSync(FILE,'utf8'));
const L=data.levels;

const sizeOf=b=>{
  const rows=b.split('/');
  return rows[0].length+'x'+rows.length;
};
const boxesOf=b=>(b.match(/[$*]/g)||[]).length;

const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
const BANDS=[[1,4],[5,20],[21,50],[51,100],[101,200],[201,300],[301,400],[401,450],[451,500]];
console.log('区間        手数  罠率  素直に全滅  一本道/どけ  荷物  最大盤');
for(const [a,b] of BANDS){
  const s=L.slice(a-1,b);
  const twisty=s.filter(l=>l.f>=2||l.og).length;
  const died=s.filter(l=>l.g>=3).length;
  const sizes=s.map(l=>{const r=l.b.split('/');return r[0].length*r.length;});
  const big=s[sizes.indexOf(Math.max(...sizes))];
  console.log(
    `${(a+'-'+b).padEnd(10)} ${avg(s.map(l=>l.p)).toFixed(1).padStart(5)}`
    +` ${avg(s.map(l=>l.tr)).toFixed(0).padStart(4)}%`
    +` ${(died+'/'+s.length).padStart(10)}`
    +` ${(twisty+'/'+s.length).padStart(11)}`
    +` ${avg(s.map(l=>boxesOf(l.b))).toFixed(1).padStart(5)}`
    +` ${sizeOf(big.b).padStart(7)}`);
}

console.log('\n最初の10面');
for(let i=0;i<10;i++){
  const l=L[i];
  console.log(`  第${String(i+1).padStart(3)}面 ${sizeOf(l.b).padStart(5)} 荷物${boxesOf(l.b)}個`
    +` 最短${String(l.p).padStart(2)}手 罠率${String(l.tr).padStart(3)}% 素直に詰む${l.g}/3`
    +` 一本道${l.f} どけ${l.og}  ${l.sh}`);
}

const shapes={}, big=[];
for(let i=0;i<L.length;i++){
  shapes[L[i].sh]=(shapes[L[i].sh]||0)+1;
  const r=L[i].b.split('/');
  if(r[0].length>=11||r.length>=11) big.push(i+1);
}
console.log('\n形の内訳: '+Object.entries(shapes).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+v).join(' / '));
console.log(`大きい面 ${big.length}面: ${big.join(', ')}`);
