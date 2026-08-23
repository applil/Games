/* 着せ替えごとのルール。
 *
 * いままでルールは1つしかなく、engine.js の pushesFrom がその全部だった。
 * 着せ替えごとに違うルールにするため、ここに「局面の進め方」をまとめる。
 *
 * どのルールも同じ形で答える:
 *   parse(board)          … 盤の文字列を、そのルールが要る形に開く
 *   start(p)              … 最初の局面
 *   moves(p, st)          … その局面から進める先(押し手の一覧)
 *   solved(p, st)         … 解けたか
 *   key(st)               … 局面を見分ける鍵(探索で同じ局面を二度見ないため)
 *
 * 局面(st)の中身はルールごとに違ってよい。共通なのは
 *   boxes … 荷物の位置(小さい順)
 *   rep   … 自機がいる区画の代表値(同じ区画ならどこに居ても同じ局面)
 * の2つで、これに各ルールが必要なものを足す。
 *
 * 盤の文字は倉庫番の書き方(XSB)に、この企画のぶんを足したもの:
 *   #壁  空白床  .置き場  $荷物  *置き場の上の荷物  @自機  +置き場の上の自機
 *   ~水  … 夏。自機は通れるが荷物は通れない
 */
(function(root){
'use strict';

const E = root.WarehouseEngine || require('./engine.js').WarehouseEngine;
const {regionRep, keyOf} = E;

/* 盤の文字列を、マス目の配列に開く。ルール共通の下ごしらえ */
function parseBoard(board, extra){
  const rows=board.split('/');
  const h=rows.length, w=Math.max(...rows.map(r=>r.length));
  const grid=new Uint8Array(w*h).fill(1);      // 1=壁 0=床
  const water=new Uint8Array(w*h);             // 1=水(自機は通れる、荷物は通れない)
  const boxes=[], goals=[];
  let player=-1;
  for(let y=0;y<h;y++){
    const row=rows[y].padEnd(w,'#');
    for(let x=0;x<w;x++){
      const c=row[x], i=y*w+x;
      if(c==='#') continue;
      grid[i]=0;
      if(c==='~'){ water[i]=1; continue; }
      if(c==='$'||c==='*') boxes.push(i);
      if(c==='.'||c==='*'||c==='+') goals.push(i);
      if(c==='@'||c==='+') player=i;
    }
  }
  const p={board,grid,water,w,h,
           boxes:boxes.sort((a,b)=>a-b),
           goals:goals.sort((a,b)=>a-b),
           player};
  if(extra) extra(p, rows);
  return p;
}

/* ふつう。いままでのルールそのまま */
const plain = {
  name:'plain',
  parse: b=>parseBoard(b),
  start(p){
    const r=regionRep(p.grid,p.w,new Set(p.boxes),p.player);
    return {boxes:p.boxes.slice(), rep:r.rep, cells:r.cells};
  },
  moves(p, st){
    const {grid,w}=p;
    const boxSet=new Set(st.boxes);
    const out=[];
    for(const b of st.boxes){
      for(const dir of [1,-1,w,-w]){
        const from=b-dir, to=b+dir;
        if(grid[from]||boxSet.has(from)) continue;
        if(grid[to]||boxSet.has(to)) continue;
        if(!st.cells.has(from)) continue;
        const nb=st.boxes.slice();
        nb[nb.indexOf(b)]=to;
        nb.sort((x,y)=>x-y);
        const r=regionRep(grid,w,new Set(nb),b);
        out.push({box:b, dir, to, st:{boxes:nb, rep:r.rep, cells:r.cells}});
      }
    }
    return out;
  },
  solved(p, st){
    const g=new Set(p.goals);
    return st.boxes.every(b=>g.has(b));
  },
  key: st=>keyOf(st.boxes, st.rep),
};

/* 夏。水のマスは自機だけが通れる。
   ふつうとの違いは「押した先が水なら押せない」の一行だけ。
   自機の通行は水を床として扱うので、区画の計算は変えなくてよい */
const water = {
  name:'water',
  parse: b=>parseBoard(b),
  start: plain.start,
  moves(p, st){
    const {grid,w}=p;
    const boxSet=new Set(st.boxes);
    const out=[];
    for(const b of st.boxes){
      for(const dir of [1,-1,w,-w]){
        const from=b-dir, to=b+dir;
        if(grid[from]||boxSet.has(from)) continue;
        if(grid[to]||boxSet.has(to)) continue;
        if(p.water[to]) continue;              // ← ここだけがふつうとの違い
        if(!st.cells.has(from)) continue;
        const nb=st.boxes.slice();
        nb[nb.indexOf(b)]=to;
        nb.sort((x,y)=>x-y);
        const r=regionRep(grid,w,new Set(nb),b);
        out.push({box:b, dir, to, st:{boxes:nb, rep:r.rep, cells:r.cells}});
      }
    }
    return out;
  },
  solved: plain.solved,
  key: plain.key,
};

const RULES={plain, water};

if(typeof module!=='undefined' && module.exports) module.exports={RULES, parseBoard};
root.WarehouseRules={RULES, parseBoard};

})(typeof globalThis!=='undefined' ? globalThis : this);
