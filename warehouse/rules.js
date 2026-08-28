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
      if(c==='!'){ water[i]=1; player=i; players.push(i); continue; }  // カニが水の上
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

/* 印あわせ。ダンボールと置き場に印が付いていて、印が合わないとクリアにならない。
   盤の書き方は、印つきの荷物を 1〜9、印つきの置き場を a〜i(1がa、2がb…)で表す。

   A は A の置き場、B は B の置き場へ。印の無い荷物は印の無い置き場へ。
   印の無いものは万能札にしない。印なしが1つだけなら行き先は1通りに決まるので、
   見た目が静かになるだけで、全部に印を付けた面と同じになる。だから印なしは稀に出す */
const NUMS='123456789';
const GOALS='abcdefghi';
const marks = {
  name:'marks',
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
      // 印は 1,2,3… と続いている前提(抜けがあると、その番号のところが空いた列になり、
      // 探索が壊れる)。書き間違いはここで止める
      for(let k=0;k<p.num.length;k++){
        if(p.num[k]===undefined) throw new Error('荷物の印 '+(k+1)+' がない');
        if(p.slot[k]===undefined) throw new Error('置き場の印 '+GOALS[k]+' がない');
      }
      // parseBoard が拾った $ と . は、印のない荷物と置き場。
      // 印つきをそれに足して、盤ぜんたいの荷物と置き場にする
      p.free=p.boxes.slice();                     // 印のない荷物
      p.open=p.goals.slice();                     // 印のない置き場
      p.boxes=p.num.concat(p.free).sort((a,b)=>a-b);
      p.goals=p.slot.concat(p.open).sort((a,b)=>a-b);
    });
    return p;
  },
  start(p){
    const r=regionRep(p.grid,p.w,new Set(p.num.concat(p.free)),p.player);
    return {num:p.num.slice(), free:p.free.slice().sort((a,b)=>a-b), rep:r.rep, cells:r.cells};
  },
  moves(p, st){
    const {grid,w}=p;
    const boxSet=new Set(st.num.concat(st.free));
    const out=[];
    // mk は印の番号(0から)。印のない荷物は -1
    const tryPush=(b, mk)=>{
      for(const dir of [1,-1,w,-w]){
        const from=b-dir, to=b+dir;
        if(grid[from]||boxSet.has(from)) continue;
        if(grid[to]||boxSet.has(to)) continue;
        if(!st.cells.has(from)) continue;
        const nn=st.num.slice(), nf=st.free.slice();
        if(mk>=0) nn[mk]=to;
        else { nf[nf.indexOf(b)]=to; nf.sort((x,y)=>x-y); }
        const r=regionRep(grid,w,new Set(nn.concat(nf)),b);
        out.push({box:b, dir, to, n:mk+1, st:{num:nn, free:nf, rep:r.rep, cells:r.cells}});
      }
    };
    st.num.forEach(tryPush);
    st.free.forEach(b=>tryPush(b,-1));
    return out;
  },
  solved(p, st){
    const open=new Set(p.open);
    for(const b of st.free) if(!open.has(b)) return false;   // 印なしは印なしの置き場へ
    for(let k=0;k<st.num.length;k++){
      if(st.num[k]!==p.slot[k]) return false;               // A は A、B は B
    }
    return true;
  },
  key: st=>st.num.join(',')+'|'+st.free.join(',')+'|'+st.rep,
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
    const blocked=new Set(boxes);
    for(const o of off) blocked.add(o);
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
    const bees=p.players.slice();
    const r=duo.region(p, p.boxes, bees.filter((_,i)=>i!==0), bees[0]);
    return {boxes:p.boxes.slice(), bees, turn:0, rep:r.rep, cells:r.cells};
  },
  moves(p, st){
    const {grid,w}=p;
    const boxSet=new Set(st.boxes);
    const wait=new Set(st.bees.filter((_,i)=>i!==st.turn));   // 番でないミツバチ=壁
    const out=[];
    for(const b of st.boxes){
      for(const dir of [1,-1,w,-w]){
        const from=b-dir, to=b+dir;
        if(!st.cells.has(from)) continue;                     // そこに立てない
        if(grid[to]||boxSet.has(to)||wait.has(to)) continue;  // 待っている子には押し込めない
        const nb=st.boxes.slice();
        nb[nb.indexOf(b)]=to;
        nb.sort((x,y)=>x-y);
        // 押したミツバチは荷物のいた場所へ移り、そこで壁になる。次は並び順で次の子
        const nbees=st.bees.slice();
        nbees[st.turn]=b;
        const nturn=(st.turn+1)%nbees.length;
        const r=duo.region(p, nb, nbees.filter((_,i)=>i!==nturn), nbees[nturn]);
        out.push({box:b, dir, to,
                  st:{boxes:nb, bees:nbees, turn:nturn, rep:r.rep, cells:r.cells}});
      }
    }
    return out;
  },
  solved: plain.solved,
  /* 2匹のときは、どちらが番かを見分けなくてよい(2匹に区別がないので、
     入れ替えても同じ場面)。3匹以上は回る順番が効くので、番号と番を鍵に入れる */
  key(st){
    const b=st.boxes.join(',');
    if(st.bees.length<=2)
      return b+'|'+st.bees.filter((_,i)=>i!==st.turn).join(',')+'|'+st.rep;
    return b+'|'+st.bees.map((x,i)=>i===st.turn?st.rep:x).join(',')+'|'+st.turn;
  },
};

/* 蟻。盤の上に同僚の蟻(&)がいて、こちらが1つ押すと、同僚も1つずつ押してしまう。

   本人が決めたこと(2026-08-21 / 08-23):
     ・動くのは 全部の蟻
     ・押すのは 自分から一番近いダンボール
     ・向きは  蟻が歩いてきた向きのまま(回り込まない)
     ・押せないときは 動かない

   こちらで決めた細かいところ(違っていたら直す):
     ・「一番近い」は歩いた距離。壁・ダンボール・ほかの蟻・自機は通れない
     ・同じ距離で行ける面が複数あるときは 上・下・左・右 の順で選ぶ
     ・押したあと、蟻はダンボールがいた場所に入る
     ・蟻は盤の左上に近いものから順に動かす。前の蟻が動いた結果を見て次が動く

   局面は「ダンボールの位置・蟻の位置・自機の行ける範囲」の3つ。
   蟻どうしに区別はないので、蟻は並べ替えて持つ */
/* 蟻。盤の上に同僚の蟻(&)がいて、こちらが1つ押すと、同僚も1手ずつ動く。

   本人が決めたこと(2026-08-24):
     ・はじめは、自分から一番近い荷物に取り付き、取り付いた向きのまま押す
     ・一度押しはじめたら、その荷物に執着する(近くに別の荷物が来ても乗り換えない)
     ・その向きに押せなくなったら、どちらかに回り込んで別の向きから押す
     ・主人公に自分の荷物を取られたら、それ以外で一番近い荷物を探す
     ・主人公がいま押している荷物には触らない
     ・置き場に載っている荷物には触らない(せっかく収めたものを動かさない)
     ・やることが無くなったら止まっている

   蟻はこちらの1手につき1マス押す。押す位置までは、何マス離れていても歩いていく
   (盤を広くしてあるのは、どれが一番近い荷物かを目で分かりやすくするため)。

     ・荷物に接するまでの道は、曲がる回数がいちばん少ないものを選ぶ。
       接したときに進んでいた向きが、そのまま押す向きになる

   こちらで決めた細かいところ(違っていたら直す):
     ・「一番近い」は、押す位置までの歩数。壁・荷物・ほかの蟻・主人公は通れない
     ・同じ歩数の荷物が2つあれば、盤の左上に近いほう
     ・曲がる回数が同じ道が2つあれば、歩く距離が短いほう。
       それも同じなら、接する向きが 上・下・左・右 の順
       (すでに荷物の隣にいるなら距離0。目の前の荷物を素通りしない)
     ・回り込む先は、まず左右(いまの向きと直角)で曲がりの少ないほう。
       どちらも無理なら反対側。それも無理なら、その荷物を手放す
     ・1つの荷物に取り付けるのは1匹だけ。左上に近い蟻から先に決める
     ・「主人公が押している荷物」は、直前の1手で主人公が押した荷物のこと

   局面には、荷物の位置に加えて「蟻それぞれの居場所・取り付いている荷物・押す向き」が入る */
const ants = {
  name:'ants',
  parse: b=>parseBoard(b, (p, rows)=>{
    const w=p.w;
    p.ants=[];
    for(let y=0;y<rows.length;y++){
      const row=rows[y].padEnd(w,'#');
      for(let x=0;x<w;x++) if(row[x]==='&'){ p.grid[y*w+x]=0; p.ants.push(y*w+x); }
    }
    p.ants.sort((a,b)=>a-b);
  }),
  dirs(p){ return [-p.w, p.w, -1, 1]; },     // 上・下・左・右。この順が同点のときの優先順
  /* 曲がる回数がいちばん少ない道を測る。
     返すのは「そのマスへ、その向きで入るまでに何回曲がったか」。
     まっすぐ進むのは0、向きを変えるのが1。最初の1歩はどの向きでも0。
     押す向きは「接したときに進んでいた向き」なので、ここが押す向きを決める。
     曲がり0か1の枝しかないので、前に入れるか後ろに入れるかの列(0-1BFS)で足りる */
  bends(p, blocked, from){
    const {grid,w}=p, D=[-w,w,-1,1];
    const N=grid.length;
    const cost=new Int32Array(N*4).fill(-1);
    const prev=new Int32Array(N*4).fill(-1);
    const dq=new Array(N*8); let head=N*4, tail=N*4;   // 真ん中から前後に伸ばす
    for(let k=0;k<4;k++){
      const n=from+D[k];
      if(n<0||n>=N||grid[n]||blocked.has(n)) continue;
      const id=n*4+k;
      if(cost[id]<0){ cost[id]=0; dq[tail++]=id; }
    }
    while(head<tail){
      const id=dq[head++];
      const c=id>>2, k=id&3, t=cost[id];
      for(let j=0;j<4;j++){
        const n=c+D[j];
        if(n<0||n>=N||grid[n]||blocked.has(n)) continue;
        const nid=n*4+j, nt=t+(j===k?0:1);
        if(cost[nid]>=0 && cost[nid]<=nt) continue;
        cost[nid]=nt; prev[nid]=id;
        if(j===k) dq[--head]=nid; else dq[tail++]=nid;
      }
    }
    return {cost, prev};
  },
  // from から各マスまでの歩数。壁と blocked は通れない
  walk(p, blocked, from){
    const {grid,w}=p;
    const dist=new Map([[from,0]]);
    const q=[from];
    for(let i=0;i<q.length;i++){
      const c=q[i], d=dist.get(c)+1;
      for(const s of [-w,w,-1,1]){
        const n=c+s;
        if(n<0||n>=grid.length) continue;
        if(grid[n]||blocked.has(n)||dist.has(n)) continue;
        dist.set(n,d); q.push(n);
      }
    }
    return dist;
  },
  /* 蟻を1匹進める。盤の中身(boxes / ants)はその場で書き換える。
     taboo は「主人公が直前に押した荷物」の、いまの位置 */
  step(p, boxes, ants, player, taboo, who){
    const {grid,w}=p;
    const D=this.dirs(p);
    const me=ants[who];
    const blocked=new Set(boxes);
    ants.forEach((a,i)=>{ if(i!==who) blocked.add(a.at); });
    blocked.add(player);

    // 取られた荷物・主人公がいま押している荷物・置き場に収まった荷物は手放す
    const done=new Set(p.goals);
    if(me.claim>=0 && (boxes.indexOf(me.claim)<0 || me.claim===taboo || done.has(me.claim))){
      me.claim=-1; me.dir=-1;
    }

    const dist=this.walk(p, blocked, me.at);
    const taken=new Set();
    ants.forEach((a,i)=>{ if(i!==who && a.claim>=0) taken.add(a.claim); });

    const bend=this.bends(p, blocked, me.at);
    // その向きで押しにいけるか。行けるなら曲がる回数を返す
    const ok=(b,k)=>{
      const dir=D[k], stand=b-dir, to=b+dir;
      if(grid[to]||blocked.has(to)) return -1;
      if(stand===me.at) return 0;                        // もう接している。曲がり0・距離0
      if(!dist.has(stand)) return -1;
      const t=bend.cost[stand*4+k];
      if(t<0) return -1;
      return t*1000 + dist.get(stand);                   // 曲がり優先、同じなら短いほう
    };

    // まだ取り付いていなければ、一番近い荷物を選ぶ。
    // どの向きから接するかは、曲がる回数がいちばん少ない道で決まる
    if(me.claim<0){
      let best=null;
      for(const b of boxes){
        if(b===taboo || taken.has(b) || done.has(b)) continue;   // 収まった荷物は触らない
        let near=Infinity, turn=null;
        for(let k=0;k<4;k++){
          const stand=b-D[k];
          if(dist.has(stand)) near=Math.min(near, dist.get(stand));
          const t=ok(b,k);
          if(t<0) continue;
          if(!turn || t<turn.t || (t===turn.t && k<turn.k)) turn={t,k};
        }
        if(!turn) continue;                              // 押せる向きが無い
        if(!best || near<best.near || (near===best.near && b<best.box))
          best={near, box:b, k:turn.k};
      }
      if(!best) return null;                             // 触れる荷物が無い。動かない
      me.claim=best.box; me.dir=best.k;
    }

    // いまの向きで押せるか。だめなら回り込む先を決める
    const b=me.claim;
    if(ok(b,me.dir)<0){
      const side = (me.dir===0||me.dir===1) ? [2,3] : [0,1];   // いまの向きと直角の2つ
      let pick=null;
      for(const k of side){ const t=ok(b,k); if(t>=0 && (!pick || t<pick.t)) pick={k,t}; }
      if(!pick){ const t=ok(b, me.dir^1); if(t>=0) pick={k:me.dir^1,t}; }
      if(!pick){ me.claim=-1; me.dir=-1; return null; }         // この荷物はもう押せない
      me.dir=pick.k;
    }
    // 押す位置まで歩いて、1マス押す
    const dir=D[me.dir], stand=b-dir, to=b+dir;
    boxes[boxes.indexOf(b)]=to;
    me.at=b;                                             // 荷物のいた場所へ入る
    me.claim=to;                                         // 執着はそのまま、位置だけ更新
    return {ant:stand, box:b, dir, to};
  },
  start(p){
    const blocked=new Set(p.boxes.concat(p.ants));
    const r=regionRep(p.grid,p.w,blocked,p.player);
    return {boxes:p.boxes.slice(),
            ants:p.ants.map(a=>({at:a, claim:-1, dir:-1})),
            rep:r.rep, cells:r.cells};
  },
  moves(p, st){
    const {grid,w}=p;
    const boxSet=new Set(st.boxes);
    const antSet=new Set(st.ants.map(a=>a.at));
    const out=[];
    for(const b of st.boxes){
      for(const dir of [1,-1,w,-w]){
        const from=b-dir, to=b+dir;
        if(grid[from]||boxSet.has(from)||antSet.has(from)) continue;
        if(grid[to]||boxSet.has(to)||antSet.has(to)) continue;
        if(!st.cells.has(from)) continue;
        const nb=st.boxes.slice();
        nb[nb.indexOf(b)]=to;
        const na=st.ants.map(a=>({at:a.at, claim:a.claim, dir:a.dir}));
        // 取り付いていた荷物が動いたら、執着先の位置も動かす
        for(const a of na) if(a.claim===b) a.claim=to;
        const me=b;                                      // 主人公は荷物のいた場所へ
        const acts=[];
        for(let i=0;i<na.length;i++){
          const a=ants.step(p, nb, na, me, to, i);
          if(a) acts.push(a);
        }
        nb.sort((x,y)=>x-y);
        na.sort((x,y)=>x.at-y.at);
        const blocked=new Set(nb.concat(na.map(a=>a.at)));
        const r=regionRep(grid,w,blocked,me);
        out.push({box:b, dir, to, acts, st:{boxes:nb, ants:na, rep:r.rep, cells:r.cells}});
      }
    }
    return out;
  },
  solved(p, st){
    const g=new Set(p.goals);
    return st.boxes.every(b=>g.has(b));
  },
  key: st=>st.boxes.join(',')+'|'
        +st.ants.map(a=>a.at+':'+a.claim+':'+a.dir).join(',')+'|'+st.rep,
};

const RULES={plain, water, holes, slide, marks, roll, duo, ants};
RULES.numbered=marks;      // 前の名前。古いパックの rule 名でも引けるように

if(typeof module!=='undefined' && module.exports) module.exports={RULES, parseBoard};
root.WarehouseRules={RULES, parseBoard};

})(typeof globalThis!=='undefined' ? globalThis : this);
