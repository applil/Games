'use strict';
/* 炎と氷ステージ版を組み立てる。
 * レッスン + 4×4パック + 本編100面。
 * レッスンは「直前までのルールでは独解にならず、新しいルールで初めて解ける」面にする。
 *
 *   node tools/make-fire-ice-tutorial.js
 */

const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','fire-ice-story','engine.js'));

const DIR=path.join(__dirname,'..','fire-ice-story');
const FILE=path.join(DIR,'levels.json');
const PACK4=path.join(DIR,'pack-4x4.json');
const PACK100=path.join(DIR,'pack-original.json');

function idx(n,r,c){ return r*n+c; }

/* ルールを足し引きして独解か見る。
 * count: 各行・列の同数 / triple: 3連続禁止 / unique: 同じ並び禁止 / cons: ＝× */
function countSol(n, g0, cons, rules, limit){
  const HALF=n/2;
  const consMap=Array.from({length:n*n},()=>[]);
  for(const cn of cons||[]){
    consMap[cn.a].push({other:cn.b,type:cn.type});
    consMap[cn.b].push({other:cn.a,type:cn.type});
  }
  function lineCount(g,idx,isRow){
    let c0=0,c1=0;
    for(let k=0;k<n;k++){ const v=isRow?g[idx*n+k]:g[k*n+idx]; if(v===1)c1++; else if(v===0)c0++; }
    return c0<=HALF && c1<=HALF;
  }
  function lineTriple(g,idx,isRow){
    let run=1, prev=null;
    for(let k=0;k<n;k++){
      const v=isRow?g[idx*n+k]:g[k*n+idx];
      if(v!==null && v===prev){ run++; if(run>=3) return false; }
      else { run=1; prev=v===null?Symbol():v; }
    }
    return true;
  }
  function lineComplete(g,idx,isRow){
    for(let k=0;k<n;k++) if((isRow?g[idx*n+k]:g[k*n+idx])===null) return false;
    return true;
  }
  function linesEqual(g,a,b,isRow){
    for(let k=0;k<n;k++) if((isRow?g[a*n+k]:g[k*n+a])!==(isRow?g[b*n+k]:g[k*n+b])) return false;
    return true;
  }
  function uniqueOk(g,r,c){
    if(lineComplete(g,r,true)){
      for(let r2=0;r2<n;r2++) if(r2!==r && lineComplete(g,r2,true) && linesEqual(g,r,r2,true)) return false;
    }
    if(lineComplete(g,c,false)){
      for(let c2=0;c2<n;c2++) if(c2!==c && lineComplete(g,c2,false) && linesEqual(g,c,c2,false)) return false;
    }
    return true;
  }
  function consOk(g,i){
    if(g[i]===null) return true;
    for(const {other,type} of consMap[i]){
      const ov=g[other]; if(ov===null) continue;
      if(type==='eq' && ov!==g[i]) return false;
      if(type==='ne' && ov===g[i]) return false;
    }
    return true;
  }
  function placeOk(g,r,c,v){
    const i=r*n+c; g[i]=v;
    let ok=true;
    if(rules.count && (!lineCount(g,r,true)||!lineCount(g,c,false))) ok=false;
    if(ok && rules.triple && (!lineTriple(g,r,true)||!lineTriple(g,c,false))) ok=false;
    if(ok && rules.unique && !uniqueOk(g,r,c)) ok=false;
    if(ok && rules.cons && !consOk(g,i)) ok=false;
    g[i]=null; return ok;
  }
  function propagate(g){
    let progress=true;
    while(progress){
      progress=false;
      for(let i=0;i<n*n;i++){
        if(g[i]!==null) continue;
        const r=i/n|0, c=i%n;
        const can0=placeOk(g,r,c,0), can1=placeOk(g,r,c,1);
        if(!can0 && !can1) return false;
        if(can0!==can1){ g[i]=can1?1:0; progress=true; }
      }
    }
    return true;
  }
  let nsol=0;
  function rec(g){
    if(nsol>=limit) return;
    if(!propagate(g)) return;
    const i=g.indexOf(null);
    if(i<0){ nsol++; return; }
    const r=i/n|0, c=i%n;
    for(const v of [1,0]){
      if(!placeOk(g,r,c,v)) continue;
      const t=g.slice(); t[i]=v; rec(t);
    }
  }
  rec(g0.slice());
  return nsol;
}

const COUNT={count:true,triple:false,unique:false,cons:false};
const COUNT_TRIPLE={count:true,triple:true,unique:false,cons:false};
const COUNT_TRIPLE_CONS={count:true,triple:true,unique:false,cons:true};
const LOGIC={count:true,triple:true,unique:true,cons:true};
const NONE={count:false,triple:false,unique:false,cons:false};

function pack(n, puz, sol, cons, lesson, extra){
  const eng=E.makeEngine(n, ()=>0);
  eng.setConstraints(cons);
  const info=eng.analyse(puz);
  if(!info.ok) throw new Error('解けない: '+lesson.slice(0,20));
  if(extra && extra.simple===true && !info.simple)
    throw new Error('単純推理で解けない（想定外）: '+lesson.slice(0,20));
  if(extra && extra.simple===false && info.simple)
    throw new Error('背理法なしで解けてしまう: '+lesson.slice(0,20));
  if(extra && extra.before){
    const a=countSol(n, puz, cons, extra.before, 3);
    if(a===1) throw new Error('旧ルールだけで解けてしまう: '+lesson.slice(0,24)+' sols='+a);
  }
  if(extra && extra.after){
    const b=countSol(n, puz, cons, extra.after, 3);
    if(b!==1) throw new Error('新ルールで独解にならない: '+lesson.slice(0,24)+' sols='+b);
  }
  const fp=n+'|'+E.encodeGrid(puz)+'|'+JSON.stringify(E.encodeCons(cons));
  return {
    id:'tut-'+E.hashId(fp),
    n,
    p:E.encodeGrid(puz),
    s:E.encodeGrid(sol),
    c:E.encodeCons(cons),
    score:0,
    empty:info.empty,
    hard:info.hard,
    tut:true,
    lesson
  };
}

function fromRows(rows, holes, consSpec){
  const n=rows.length;
  const sol=[];
  for(const row of rows){
    if(row.length!==n) throw new Error('row len');
    for(const ch of row) sol.push(+ch);
  }
  const puz=sol.slice();
  for(const [r,c] of holes) puz[idx(n,r,c)]=null;
  const cons=(consSpec||[]).map(([r1,c1,r2,c2,type])=>({
    a:idx(n,r1,c1), b:idx(n,r2,c2),
    horiz: r1===r2,
    type
  }));
  return {n, puz, sol, cons};
}

function makeHand(rows, holes, consSpec, lesson, extra){
  const {n,puz,sol,cons}=fromRows(rows, holes, consSpec);
  return pack(n, puz, sol, cons, lesson, extra);
}

function shiftGrid(g,n,dr,dc){
  const out=Array(n*n);
  for(let r=0;r<n;r++) for(let c=0;c<n;c++)
    out[r*n+c]=g[((r+dr)%n)*n+((c+dc)%n)];
  return out;
}
function shiftCons(cons,n,dr,dc){
  const map=i=>{
    const r=i/n|0, c=i%n;
    return ((r-dr+n)%n)*n+((c-dc+n)%n);
  };
  return (cons||[]).map(cn=>({a:map(cn.a), b:map(cn.b), horiz:cn.horiz, type:cn.type}));
}

/* 11.. または 00.. のあとに 2×2 空き。同数では2通り、3連続で独解 */
function findRunLesson(sym, seed0){
  const n=6;
  for(let s=seed0;s<seed0+8000;s++){
    const eng=E.makeEngine(n, E.mulberry32(s));
    const made=eng.makePuzzle(n*n, 0);
    if(!made) continue;
    const sol=made.solution;
    for(let r=0;r<n-1;r++) for(let c=0;c<n-3;c++){
      if(sol[r*n+c]!==sym || sol[r*n+c+1]!==sym) continue;
      const puz=sol.slice();
      puz[r*n+c+2]=null; puz[r*n+c+3]=null;
      puz[(r+1)*n+c+2]=null; puz[(r+1)*n+c+3]=null;
      if(countSol(n,puz,[],COUNT,3)===1) continue;
      if(countSol(n,puz,[],COUNT_TRIPLE,3)!==1) continue;
      return {
        puz:shiftGrid(puz,n,r,c),
        sol:shiftGrid(sol,n,r,c),
        cons:[]
      };
    }
  }
  throw new Error('3連続レッスンの種がない sym='+sym);
}

/* 4×4 の 2×2 空きに、片方がヒントの＝または×。同数だけでは決まらない */
function findConsLesson(type, seed0){
  const n=4;
  for(let s=seed0;s<seed0+8000;s++){
    const eng=E.makeEngine(n, E.mulberry32(s));
    const made=eng.makePuzzle(n*n, 0);
    if(!made) continue;
    const sol=made.solution;
    for(let r=0;r<n-1;r++) for(let c=1;c<n-1;c++){
      const puz=sol.slice();
      puz[r*n+c]=null; puz[r*n+c+1]=null;
      puz[(r+1)*n+c]=null; puz[(r+1)*n+c+1]=null;
      const a=r*n+c-1, b=r*n+c;
      if(sol[a]!==1) continue;
      const want=type==='eq' ? sol[a]===sol[b] : sol[a]!==sol[b];
      if(!want) continue;
      const cons=[{a,b,horiz:true,type}];
      if(countSol(n,puz,[],COUNT_TRIPLE,3)<2) continue;
      if(countSol(n,puz,cons,COUNT_TRIPLE_CONS,3)!==1) continue;
      return {
        puz:shiftGrid(puz,n,r,c-1),
        sol:shiftGrid(sol,n,r,c-1),
        cons:shiftCons(cons,n,r,c-1)
      };
    }
  }
  throw new Error('制約レッスンの種がない type='+type);
}

function findUniqueLesson(seed0){
  const n=4;
  for(let s=seed0;s<seed0+8000;s++){
    const eng=E.makeEngine(n, E.mulberry32(s));
    const made=eng.makePuzzle(n*n, 0);
    if(!made) continue;
    const sol=made.solution;
    const puz=sol.slice();
    puz[2]=null; puz[3]=null; puz[6]=null; puz[7]=null;
    if(countSol(n,puz,[],COUNT_TRIPLE_CONS,3)<2) continue;
    if(countSol(n,puz,[],LOGIC,3)!==1) continue;
    return {puz, sol, cons:[]};
  }
  throw new Error('同じ並びレッスンの種がない');
}

function findComboLesson(seed0){
  const n=4;
  for(let s=seed0;s<seed0+8000;s++){
    const eng=E.makeEngine(n, E.mulberry32(s));
    const made=eng.makePuzzle(11, 3);
    if(!made) continue;
    const puz=made.puzzle, sol=made.solution, cons=made.consList;
    const empty=puz.filter(v=>v===null).length;
    if(empty<3 || empty>6) continue;
    if(!cons.some(cn=>cn.type==='eq') || !cons.some(cn=>cn.type==='ne')) continue;
    if(countSol(n,puz,cons,COUNT,3)===1) continue;
    if(countSol(n,puz,cons,LOGIC,3)!==1) continue;
    return {puz, sol, cons};
  }
  throw new Error('組み合わせレッスンの種がない');
}

function contradictionLessons(){
  const out=[];
  const seen=new Set();
  const lessons=[
    'ここからは、どちらか一方を仮に置いてみると矛盾する、という考えが必要です。焦らず、1マスずつ。',
    '仮に置いてみて、矛盾したら逆が正解。背理法です。',
    'もう1面。仮置きで矛盾を見つける練習です。'
  ];
  for(let s=0;s<200 && out.length<3;s++){
    const rng=E.mulberry32(9000+s);
    const eng=E.makeEngine(6, rng);
    const made=eng.makePuzzle(22, 6);
    if(!made) continue;
    eng.setConstraints(made.consList);
    const puzzle=made.puzzle.slice();
    const order=[...Array(36).keys()].filter(i=>puzzle[i]!==null);
    for(let i=order.length-1;i>0;i--){ const j=rng()*(i+1)|0; [order[i],order[j]]=[order[j],order[i]]; }
    let found=null;
    for(const i of order){
      const backup=puzzle[i];
      puzzle[i]=null;
      if(eng.logicSolve(puzzle)){ puzzle[i]=backup; continue; }
      const deep=eng.solveWithContradiction(puzzle);
      if(deep.ok && deep.hard>=1){
        found={puzzle:puzzle.slice(), hard:deep.hard};
        break;
      }
      puzzle[i]=backup;
    }
    if(!found) continue;
    const fp=6+'|'+E.encodeGrid(found.puzzle);
    if(seen.has(fp)) continue;
    seen.add(fp);
    const info=eng.analyse(found.puzzle);
    out.push({
      id:'tut-'+E.hashId(fp+'|'+JSON.stringify(E.encodeCons(made.consList))),
      n:6,
      p:E.encodeGrid(found.puzzle),
      s:E.encodeGrid(made.solution),
      c:E.encodeCons(made.consList),
      score:0,
      empty:info.empty,
      hard:info.hard,
      tut:true,
      lesson:lessons[out.length]
    });
  }
  if(out.length<3) throw new Error('背理法のやさしい面が足りない '+out.length);
  return out;
}

function packFound(found, lesson, extra){
  const n=Math.sqrt(found.puz.length)|0;
  return pack(n, found.puz, found.sol, found.cons, lesson, extra);
}

function tutorials(){
  const list=[];

  // 1-2 同数。ルールなしでは決まらず、同数で初めて独解
  list.push(makeHand(
    ['1100','0011','1010','0101'],
    [[0,0]],
    [],
    '空いているマスを1回タップして、🔥を置いてみよう。各行・各列に🔥と🧊が2つずつ入るよ。',
    {simple:true, before:NONE, after:COUNT}
  ));
  list.push(makeHand(
    ['1100','0011','1010','0101'],
    [[0,0],[1,0]],
    [],
    '空いている2マスを埋めよう。1回タップで🔥、もう1回タップすると🧊になるよ。',
    {simple:true, before:NONE, after:COUNT}
  ));

  // 3-4 同数だけでは2通り。3連続禁止で初めて独解（4×4では同数と3連続が同じになるので6×6）
  list.push(packFound(findRunLesson(1, 1),
    '同じマークは3つ続けて置けない。🔥🔥の隣を🔥にすると3つ続くから、ここは🧊だよ。同数だけでは、まだどちらにもできる。',
    {simple:true, before:COUNT, after:COUNT_TRIPLE}
  ));
  list.push(packFound(findRunLesson(0, 1),
    '🧊🧊の隣も同じ。🧊を置くと3つ続いてしまうから🔥。🧊と🧊に挟まったマスも、これで🔥と分かるよ。',
    {simple:true, before:COUNT, after:COUNT_TRIPLE}
  ));

  // 5-6 同数+3連続では決まらず、＝/×で初めて独解
  list.push(packFound(findConsLesson('eq', 1),
    '＝でつながったマスは、同じマーク。同数だけ見てもまだ2通りある。＝を使うと、隣の🔥と同じだと分かるよ。',
    {simple:true, before:COUNT_TRIPLE, after:COUNT_TRIPLE_CONS}
  ));
  list.push(packFound(findConsLesson('ne', 1),
    '×でつながったマスは、違うマーク。同数と3連続だけでは決まらない。×を使うと、隣の🔥と反対で🧊だと分かるよ。',
    {simple:true, before:COUNT_TRIPLE, after:COUNT_TRIPLE_CONS}
  ));

  // 7 同じ並び。それ以外では2通り
  list.push(packFound(findUniqueLesson(0),
    '同じ並びの行は作れない。上の2行を同じにすると負け。数字をそろえるだけ、3連続だけ、ではまだ決まらないよ。',
    {before:COUNT_TRIPLE_CONS, after:LOGIC}
  ));

  // 8 今までの組み合わせ。同数だけでは決まらない
  list.push(packFound(findComboLesson(1),
    '今までの技を順番に。＝、3連続、×、同じ並び。1マスずつ埋めていけるよ。',
    {simple:true, before:COUNT, after:LOGIC}
  ));

  list.push(...contradictionLessons());
  return list;
}

function main(){
  const intro=JSON.parse(fs.readFileSync(PACK4,'utf8')).levels.filter(lv=>!lv.tut && lv.n===4);
  const orig=JSON.parse(fs.readFileSync(PACK100,'utf8')).levels.filter(lv=>!lv.tut);
  const tut=tutorials();
  for(const lv of tut){
    const eng=E.makeEngine(lv.n, ()=>0);
    eng.setConstraints(E.decodeCons(lv.c));
    const info=eng.analyse(E.decodeGrid(lv.p));
    if(!info.ok) throw new Error('再検証失敗 '+lv.id);
    console.log((lv.tut?'T':' ')+' n='+lv.n+' empty='+lv.empty+' hard='+lv.hard+' simple='+info.simple
      +'  '+(lv.lesson||'').slice(0,40));
  }
  const seen=new Set();
  const levels=[];
  for(const lv of tut.concat(intro).concat(orig)){
    if(seen.has(lv.id)) throw new Error('id重複 '+lv.id);
    seen.add(lv.id);
    levels.push(lv);
  }
  const data={
    v:1,
    generated:new Date().toISOString().slice(0,10),
    levels
  };
  fs.writeFileSync(FILE, JSON.stringify(data));
  console.log('tutorial '+tut.length+' + 4x4 '+intro.length+' + original '+orig.length+' = '+levels.length);
}

main();
