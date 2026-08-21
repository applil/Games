'use strict';
/* よく似た面どうしを探す道具。
 *
 *   node tools/find-similar.js [開始] [終了] [しきい値]
 *   node tools/find-similar.js 301 430 0.85
 *
 * 完全に同じ盤は生成のときに落としているが、「ほとんど同じ」は残る。
 * 遊ぶ側から見れば、壁の形と置き場がほぼ同じなら同じ面に見える。
 *
 * 8通りの向き(回転4×鏡2)すべてで重ねてみて、一番よく合う向きでの
 * 一致率を出す。大きさが違う盤も、小さいほうを大きいほうの中で
 * ずらしながら当てて、一番合う位置で測る。
 */
const fs=require('fs');
const path=require('path');
const X=require(path.join(__dirname,'xsb.js'));

const FROM=+(process.argv[2]||1), TO=+(process.argv[3]||1000);
const TH=+(process.argv[4]||0.85);
const L=JSON.parse(fs.readFileSync(path.join(__dirname,'..','warehouse','levels.json'),'utf8')).levels;

// 盤を「種類のマス目」に開く。壁=#、床=空白、置き場=.、荷物=$、人=@
function grid(b){
  const rows=b.split('/');
  const h=rows.length, w=Math.max(...rows.map(r=>r.length));
  const g=[];
  for(let y=0;y<h;y++){
    const row=rows[y].padEnd(w,'#');
    g.push(row.split('').map(c=>{
      if(c==='#') return '#';
      if(c==='.'||c==='+') return '.';
      if(c==='*') return 'X';           // 置き場に乗った荷物
      if(c==='$') return '$';
      return ' ';                        // 床と人は同じ扱い(人の位置は似ているかに効かない)
    }));
  }
  return g;
}
const rot=g=>{                            // 右へ90度
  const h=g.length, w=g[0].length, o=[];
  for(let x=0;x<w;x++){ const r=[]; for(let y=h-1;y>=0;y--) r.push(g[y][x]); o.push(r); }
  return o;
};
const flip=g=>g.map(r=>r.slice().reverse());
function variants(g){
  const out=[]; let c=g;
  for(let i=0;i<4;i++){ out.push(c); out.push(flip(c)); c=rot(c); }
  return out;
}
// a を b の中でずらして重ね、一番よく合う一致率を返す
function overlap(a, b){
  const ah=a.length, aw=a[0].length, bh=b.length, bw=b[0].length;
  if(ah>bh||aw>bw) return -1;
  let best=0;
  for(let oy=0; oy<=bh-ah; oy++){
    for(let ox=0; ox<=bw-aw; ox++){
      let same=0, total=0;
      for(let y=0;y<bh;y++){
        for(let x=0;x<bw;x++){
          const bc=b[y][x];
          const inside = y>=oy && y<oy+ah && x>=ox && x<ox+aw;
          const ac = inside ? a[y-oy][x-ox] : '#';   // はみ出しは壁とみなす
          total++;
          if(ac===bc) same++;
        }
      }
      const r=same/total;
      if(r>best) best=r;
    }
  }
  return best;
}
function similarity(b1, b2){
  const g1=grid(b1), g2=grid(b2);
  const [small, big] = (g1.length*g1[0].length <= g2.length*g2[0].length) ? [g1,g2] : [g2,g1];
  let best=0;
  for(const v of variants(small)){
    const r=overlap(v, big);
    if(r>best) best=r;
  }
  return best;
}

const boxCount=b=>(b.match(/[$*]/g)||[]).length;
const hits=[];
for(let i=FROM-1;i<TO && i<L.length;i++){
  for(let j=i+1;j<TO && j<L.length;j++){
    const a=L[i], b=L[j];
    // 荷物の数が違えば、遊んだ感じも違う。手数が倍以上違うものも見ない。
    // nbox は入っていない面があるので、盤から数える
    if(boxCount(a.b)!==boxCount(b.b)) continue;
    if(Math.max(a.p,b.p) > Math.min(a.p,b.p)*2) continue;
    const s=similarity(a.b, b.b);
    if(s>=TH) hits.push({a:i+1, b:j+1, 一致率:+s.toFixed(3), 手数:a.p+'/'+b.p, 荷物:boxCount(a.b)});
  }
}
hits.sort((x,y)=>y.一致率-x.一致率);
console.log(`第${FROM}〜${TO}面で、一致率${TH}以上の組: ${hits.length}件`);
hits.slice(0,40).forEach(h=>console.log(`  第${h.a}面 と 第${h.b}面  一致率${h.一致率}  ${h.手数}手 荷物${h.荷物}`));
if(hits.length) fs.writeFileSync(path.join(__dirname,'stock','similar.json'), JSON.stringify(hits,null,1));
