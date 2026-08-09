'use strict';
/* 盤面のテキスト表現(XSB)と、回転・鏡像をまとめた正規形。
   面の生成ツールと、お気に入りを持ち越すツールで共用する。 */

/* ================= 盤面の文字表現 (XSB) ================= */
// # 壁 / 空白 床 / $ 荷物 / . 置き場 / * 置き場の上の荷物 / @ 人 / + 置き場の上の人
function toXSB(p){
  const bs=new Set(p.boxes), gs=new Set(p.goals);
  const rows=[];
  for(let y=0;y<p.h;y++){
    let line='';
    for(let x=0;x<p.w;x++){
      const i=y*p.w+x;
      line += p.grid[i] ? '#'
            : bs.has(i) ? (gs.has(i)?'*':'$')
            : i===p.player ? (gs.has(i)?'+':'@')
            : gs.has(i) ? '.' : ' ';
    }
    rows.push(line);
  }
  return rows;
}
function fromXSB(rows){
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

/* ================= 回転・鏡像をまとめた正規形 ================= */
function transforms(rows){
  const out=[];
  let cur=rows;
  for(let r=0;r<4;r++){
    out.push(cur.join('/'));
    out.push(cur.map(line=>[...line].reverse().join('')).join('/'));   // 左右反転
    // 90度回転
    const h=cur.length, w=Math.max(...cur.map(x=>x.length));
    const rot=[];
    for(let x=0;x<w;x++){
      let line='';
      for(let y=h-1;y>=0;y--) line+=(cur[y][x]||'#');
      rot.push(line);
    }
    cur=rot;
  }
  return out;
}
const canonical=rows=>transforms(rows).sort()[0];

function hashId(str){
  // FNV-1a 32bit を2回まわして8桁にする
  const fnv=(s,seed)=>{
    let h=seed>>>0;
    for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619)>>>0; }
    return h>>>0;
  };
  return (fnv(str,2166136261).toString(16).padStart(8,'0')
        + fnv(str,913).toString(16).padStart(8,'0')).slice(0,10);
}

module.exports={toXSB, fromXSB, transforms, canonical, hashId};
