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
  const boxes=[], goals=[], players=[];
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
      if(c==='@'||c==='+'){ player=i; players.push(i); }   // 春は2匹いるので全部拾う
    }
  }
  const p={board,grid,water,w,h,
           boxes:boxes.sort((a,b)=>a-b),
           goals:goals.sort((a,b)=>a-b),
           players, player};
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

/* リス。置き場は穴。
   ドングリを落として埋めるまで通れない。埋めたら床として通れるようになり、
   そのドングリは二度と動かせない。

   ふつうとの違いは3つ:
     ・空いている穴には自機が入れない(壁として扱う)
     ・穴に落としたドングリは、以後の押し手の対象から外れる
     ・全部の穴が埋まったらクリア(=残りのドングリが0)

   埋めた穴は床になるので、通れる範囲が手を進めるほど広がっていく。
   このため自機の区画は、そのつど埋まり具合を見て計算し直す */
const holes = {
  name:'holes',
  parse: b=>parseBoard(b),
  start(p){
    const goalSet=new Set(p.goals);
    // 最初から穴の上にある荷物(*)は、埋まっているものとして扱う
    const filled=p.boxes.filter(b=>goalSet.has(b));
    const boxes=p.boxes.filter(b=>!goalSet.has(b));
    const r=this.region(p, boxes, filled, p.player);
    return {boxes, filled:filled.slice().sort((a,b)=>a-b), rep:r.rep, cells:r.cells};
  },
  // 自機が行ける範囲。空いている穴は通れない、埋めた穴は通れる
  region(p, boxes, filled, from){
    const {grid,w}=p;
    const blocked=new Set(boxes);
    const filledSet=new Set(filled);
    for(const g of p.goals) if(!filledSet.has(g)) blocked.add(g);   // 空いた穴は通れない
    const cells=new Set([from]);
    const q=[from];
    let rep=from;
    while(q.length){
      const c=q.pop();
      if(c<rep) rep=c;
      for(const d of [1,-1,w,-w]){
        const n=c+d;
        if(n<0||n>=grid.length) continue;
        if(grid[n]||blocked.has(n)||cells.has(n)) continue;
        cells.add(n); q.push(n);
      }
    }
    return {rep, cells};
  },
  moves(p, st){
    const {grid,w}=p;
    const boxSet=new Set(st.boxes);
    const filledSet=new Set(st.filled);
    const goalSet=new Set(p.goals);
    const out=[];
    for(const b of st.boxes){
      for(const dir of [1,-1,w,-w]){
        const from=b-dir, to=b+dir;
        if(grid[from]||boxSet.has(from)) continue;
        if(!st.cells.has(from)) continue;                 // そこに立てない
        if(grid[to]||boxSet.has(to)) continue;
        // 押した先が「空いている穴」なら、そこへ落として埋める。
        // 埋まった穴はもう地面と同じなので、その上は普通に転がっていける
        const drop = goalSet.has(to) && !filledSet.has(to);
        const nb=st.boxes.filter(x=>x!==b);
        const nf=st.filled.slice();
        if(drop) nf.push(to); else nb.push(to);
        nb.sort((x,y)=>x-y); nf.sort((x,y)=>x-y);
        const r=holes.region(p, nb, nf, b);               // 押したあと自機は元の位置
        out.push({box:b, dir, to, drop, st:{boxes:nb, filled:nf, rep:r.rep, cells:r.cells}});
      }
    }
    return out;
  },
  solved(p, st){ return st.boxes.length===0; },
  key: st=>st.boxes.join(',')+'|'+st.filled.join(',')+'|'+st.rep,
};

/* 冬。氷は、壁か別の氷にぶつかるまで滑っていく。
   途中では止まらないので、置き場は「何かの手前」にしか作れない。
   1マスも進めない向きへは押せない(押した気にならないよう、手にも数えない)。

   状態の数はふつうより減る(氷が止まれる場所が限られるため)。
   押したあと自機は、氷がいた場所に入る */
const slide = {
  name:'slide',
  parse: b=>parseBoard(b),
  start: plain.start,
  moves(p, st){
    const {grid,w}=p;
    const boxSet=new Set(st.boxes);
    const out=[];
    for(const b of st.boxes){
      for(const dir of [1,-1,w,-w]){
        const from=b-dir;
        if(grid[from]||boxSet.has(from)) continue;
        if(!st.cells.has(from)) continue;
        // ぶつかるまで滑らせる
        let to=b;
        while(true){
          const n=to+dir;
          if(grid[n]||boxSet.has(n)) break;
          to=n;
        }
        if(to===b) continue;                       // 1マスも動けない向き
        const nb=st.boxes.slice();
        nb[nb.indexOf(b)]=to;
        nb.sort((x,y)=>x-y);
        const r=regionRep(grid,w,new Set(nb),b);   // 自機は氷がいた場所へ
        out.push({box:b, dir, to, st:{boxes:nb, rep:r.rep, cells:r.cells}});
      }
    }
    return out;
  },
  solved: plain.solved,
  key: plain.key,
};

/* ふつう2。ダンボールと置き場に番号が付いていて、番号が合わないとクリアにならない。
   盤の書き方は、荷物を 1〜9、置き場を a〜i(1がa、2がb…)で表す。
   数字が付くことで、同じ盤でも易しくなったり難しくなったりする。

   荷物は「番号順に並べた位置の列」で持つ。入れ替わりが区別されるので、
   ふつうのルールより状態は増える(荷物n個で最大n!倍)。 */
const NUMS='123456789';
const GOALS='abcdefghi';
const numbered = {
  name:'numbered',
  parse(b){
    const p=parseBoard(b, (p, rows)=>{
      const w=p.w;
      p.num=[]; p.slot=[];                    // 番号ごとの、荷物の位置と置き場の位置
      for(let y=0;y<rows.length;y++){
        const row=rows[y].padEnd(w,'#');
        for(let x=0;x<w;x++){
          const c=row[x], i=y*w+x;
          const n=NUMS.indexOf(c), g=GOALS.indexOf(c);
          if(n>=0){ p.grid[i]=0; p.num[n]=i; }
          if(g>=0){ p.grid[i]=0; p.slot[g]=i; }
        }
      }
      if(p.num.length){ p.boxes=p.num.slice().sort((a,b)=>a-b);
                        p.goals=p.slot.slice().sort((a,b)=>a-b); }
    });
    return p;
  },
  start(p){
    const r=regionRep(p.grid,p.w,new Set(p.num),p.player);
    return {num:p.num.slice(), rep:r.rep, cells:r.cells};
  },
  moves(p, st){
    const {grid,w}=p;
    const boxSet=new Set(st.num);
    const out=[];
    st.num.forEach((b,k)=>{
      for(const dir of [1,-1,w,-w]){
        const from=b-dir, to=b+dir;
        if(grid[from]||boxSet.has(from)) continue;
        if(grid[to]||boxSet.has(to)) continue;
        if(!st.cells.has(from)) continue;
        const nn=st.num.slice(); nn[k]=to;
        const r=regionRep(grid,w,new Set(nn),b);
        out.push({box:b, dir, to, n:k+1, st:{num:nn, rep:r.rep, cells:r.cells}});
      }
    });
    return out;
  },
  solved(p, st){ return st.num.every((b,k)=>b===p.slot[k]); },
  key: st=>st.num.join(',')+'|'+st.rep,
};

/* フンコロガシ。押すたびにウンコが時計回りに90度まわる。
   全部が置き場に乗り、かつ向きが元(0)に戻っていないとクリアにならない。
   つまり、それぞれを押した回数が4の倍数でなければならない。

   荷物ごとに向き(0〜3)を持つので、状態はふつうより最大4^n 倍になる。
   位置が同じで向きだけ違う局面は別物として数える */
const roll = {
  name:'roll',
  parse: b=>parseBoard(b),
  start(p){
    const r=regionRep(p.grid,p.w,new Set(p.boxes),p.player);
    return {boxes:p.boxes.slice(), rot:p.boxes.map(()=>0), rep:r.rep, cells:r.cells};
  },
  moves(p, st){
    const {grid,w}=p;
    const boxSet=new Set(st.boxes);
    const out=[];
    st.boxes.forEach((b,k)=>{
      for(const dir of [1,-1,w,-w]){
        const from=b-dir, to=b+dir;
        if(grid[from]||boxSet.has(from)) continue;
        if(grid[to]||boxSet.has(to)) continue;
        if(!st.cells.has(from)) continue;
        const nb=st.boxes.slice(), nr=st.rot.slice();
        nb[k]=to; nr[k]=(nr[k]+1)%4;                 // 押すたび時計回りに90度
        // 位置の小さい順に並べ替える。向きも一緒に連れていく
        const pair=nb.map((x,i)=>[x,nr[i]]).sort((a,b2)=>a[0]-b2[0]);
        const r=regionRep(grid,w,new Set(nb),b);
        out.push({box:b, dir, to, rot:nr[k],
                  st:{boxes:pair.map(x=>x[0]), rot:pair.map(x=>x[1]), rep:r.rep, cells:r.cells}});
      }
    });
    return out;
  },
  solved(p, st){
    const g=new Set(p.goals);
    return st.boxes.every((b,k)=>g.has(b) && st.rot[k]===0);
  },
  key: st=>st.boxes.join(',')+'|'+st.rot.join('')+'|'+st.rep,
};

/* 春。ミツバチが2匹いて、1回押すごとに交代する。
   番でないミツバチは壁になる(通り抜けられない、押し込めない)。
   押さないただの移動では交代しない。

   局面に要るのは
     ・荷物の位置
     ・番でないミツバチの居場所(壁なので、どこに居るかが効く)
     ・番のミツバチが行ける範囲(その代表値)
   の3つ。2匹に区別はないので、どちらが番かは局面の見分けに入れない。

   押した直後、そのミツバチは荷物のいた場所に入り、そこで壁に変わる。
   相手はその瞬間から動きだすので、次の範囲は相手の居場所から数える。

   壁が1マス動きまわるので、行ける範囲は毎手ごとに変わる。
   ふつうのルールより状態はずっと多い */
const duo = {
  name:'duo',
  parse: b=>parseBoard(b),
  // from から行ける範囲。荷物と、番でないミツバチが壁
  region(p, boxes, off, from){
    const {grid,w}=p;
    const blocked=new Set(boxes); blocked.add(off);
    const cells=new Set([from]);
    const q=[from];
    let rep=from;
    while(q.length){
      const c=q.pop();
      if(c<rep) rep=c;
      for(const d of [1,-1,w,-w]){
        const n=c+d;
        if(n<0||n>=grid.length) continue;
        if(grid[n]||blocked.has(n)||cells.has(n)) continue;
        cells.add(n); q.push(n);
      }
    }
    return {rep, cells};
  },
  start(p){
    const [a,b]=p.players;
    const r=duo.region(p, p.boxes, b, a);
    return {boxes:p.boxes.slice(), off:b, rep:r.rep, cells:r.cells};
  },
  moves(p, st){
    const {grid,w}=p;
    const boxSet=new Set(st.boxes);
    const out=[];
    for(const b of st.boxes){
      for(const dir of [1,-1,w,-w]){
        const from=b-dir, to=b+dir;
        if(!st.cells.has(from)) continue;                    // そこに立てない
        if(grid[to]||boxSet.has(to)||to===st.off) continue;  // 相方には押し込めない
        const nb=st.boxes.slice();
        nb[nb.indexOf(b)]=to;
        nb.sort((x,y)=>x-y);
        // 押したミツバチは荷物のいた場所へ移り、そこで壁になる。次は相方の番
        const r=duo.region(p, nb, b, st.off);
        out.push({box:b, dir, to, st:{boxes:nb, off:b, rep:r.rep, cells:r.cells}});
      }
    }
    return out;
  },
  solved: plain.solved,
  key: st=>st.boxes.join(',')+'|'+st.off+'|'+st.rep,
};

const RULES={plain, water, holes, slide, numbered, roll, duo};

if(typeof module!=='undefined' && module.exports) module.exports={RULES, parseBoard};
root.WarehouseRules={RULES, parseBoard};

})(typeof globalThis!=='undefined' ? globalThis : this);
