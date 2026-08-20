'use strict';
/* 炎と氷の生成・判定。ブラウザと Node の両方から使う。 */

function mulberry32(a){
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

function makeEngine(N, rng){
  const HALF=N/2;
  let consMap=[];
  let constraints=[];

  function setConstraints(list){
    constraints=list||[];
    consMap=Array.from({length:N*N},()=>[]);
    for(const cn of constraints){
      consMap[cn.a].push({other:cn.b,type:cn.type});
      consMap[cn.b].push({other:cn.a,type:cn.type});
    }
  }

  const shuffle=a=>{
    for(let i=a.length-1;i>0;i--){
      const j=rng()*(i+1)|0;
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  };

  function lineValid(g, idx, isRow){
    let c0=0, c1=0, run=1, prev=null;
    for(let k=0;k<N;k++){
      const v=isRow?g[idx*N+k]:g[k*N+idx];
      if(v===1) c1++; else if(v===0) c0++;
      if(v!==null && v===prev){ run++; if(run>=3) return false; }
      else run=1;
      prev=v===null?Symbol():v;
    }
    return c0<=HALF && c1<=HALF;
  }
  function consValid(g, i){
    for(const {other,type} of consMap[i]){
      const ov=g[other];
      if(ov===null) continue;
      if(type==='eq' && ov!==g[i]) return false;
      if(type==='ne' && ov===g[i]) return false;
    }
    return true;
  }
  function lineComplete(g, idx, isRow){
    for(let k=0;k<N;k++) if((isRow?g[idx*N+k]:g[k*N+idx])===null) return false;
    return true;
  }
  function linesEqual(g, a, b, isRow){
    for(let k=0;k<N;k++){
      if((isRow?g[a*N+k]:g[k*N+a])!==(isRow?g[b*N+k]:g[k*N+b])) return false;
    }
    return true;
  }
  function uniqueValid(g, r, c){
    if(lineComplete(g,r,true)){
      for(let r2=0;r2<N;r2++)
        if(r2!==r && lineComplete(g,r2,true) && linesEqual(g,r,r2,true)) return false;
    }
    if(lineComplete(g,c,false)){
      for(let c2=0;c2<N;c2++)
        if(c2!==c && lineComplete(g,c2,false) && linesEqual(g,c,c2,false)) return false;
    }
    return true;
  }
  function placementValid(g, r, c, v){
    const i=r*N+c;
    g[i]=v;
    const ok=lineValid(g,r,true)&&lineValid(g,c,false)&&consValid(g,i)&&uniqueValid(g,r,c);
    g[i]=null;
    return ok;
  }

  function generateSolution(){
    setConstraints([]);
    const g=new Array(N*N).fill(null);
    function fill(i){
      if(i===N*N) return true;
      const r=i/N|0, c=i%N;
      for(const v of shuffle([0,1])){
        if(placementValid(g,r,c,v)){
          g[r*N+c]=v;
          if(fill(i+1)) return true;
          g[r*N+c]=null;
        }
      }
      return false;
    }
    return fill(0) ? g : null;
  }

  function propagate(g){
    let progress=true, rounds=0;
    while(progress){
      progress=false;
      rounds++;
      for(let i=0;i<N*N;i++){
        if(g[i]!==null) continue;
        const r=i/N|0, c=i%N;
        const can0=placementValid(g,r,c,0);
        const can1=placementValid(g,r,c,1);
        if(!can0 && !can1) return {ok:false, rounds};
        if(can0!==can1){ g[i]=can1?1:0; progress=true; }
      }
    }
    return {ok:true, rounds};
  }

  function logicSolve(puzzle){
    const g=puzzle.slice();
    const p=propagate(g);
    return p.ok && g.every(v=>v!==null) ? {grid:g, rounds:p.rounds} : null;
  }

  function solveWithContradiction(puzzle){
    const g=puzzle.slice();
    const first=propagate(g);
    if(!first.ok) return {ok:false, hard:0, rounds:first.rounds};
    let hard=0, rounds=first.rounds;
    let stuck=false;
    while(!stuck && g.some(v=>v===null)){
      stuck=true;
      outer:
      for(let i=0;i<N*N;i++){
        if(g[i]!==null) continue;
        for(const v of [0,1]){
          const t=g.slice();
          t[i]=v;
          if(!propagate(t).ok){
            g[i]=1-v;
            hard++;
            const p=propagate(g);
            if(!p.ok) return {ok:false, hard, rounds};
            rounds+=p.rounds;
            stuck=false;
            break outer;
          }
        }
      }
    }
    return {ok:g.every(v=>v!==null), hard, rounds, grid:g};
  }

  function allEdges(){
    const e=[];
    for(let r=0;r<N;r++) for(let c=0;c<N;c++){
      if(c<N-1) e.push({a:r*N+c, b:r*N+c+1, horiz:true});
      if(r<N-1) e.push({a:r*N+c, b:(r+1)*N+c, horiz:false});
    }
    return e;
  }

  function makePuzzle(minClues, numCons, extra){
    const solution=generateSolution();
    if(!solution) return null;
    const edges=shuffle(allEdges()).slice(0, numCons);
    const consList=edges.map(e=>({
      a:e.a, b:e.b, horiz:e.horiz,
      type:solution[e.a]===solution[e.b]?'eq':'ne'
    }));
    setConstraints(consList);

    const puzzle=solution.slice();
    let clues=N*N;
    for(const i of shuffle([...Array(N*N).keys()])){
      if(clues<=minClues) break;
      const backup=puzzle[i];
      puzzle[i]=null;
      if(logicSolve(puzzle)) clues--;
      else puzzle[i]=backup;
    }
    if(extra){
      let removed=0, attempts=0;
      for(const i of shuffle([...Array(N*N).keys()])){
        if(removed>=extra.removals || attempts>=extra.tries) break;
        if(puzzle[i]===null) continue;
        attempts++;
        const backup=puzzle[i];
        puzzle[i]=null;
        if(solveWithContradiction(puzzle).ok) removed++;
        else puzzle[i]=backup;
      }
    }
    return {puzzle, solution, consList};
  }

  function analyse(puzzle){
    const simple=logicSolve(puzzle);
    if(simple){
      return {
        ok:true, simple:true, hard:0, rounds:simple.rounds,
        empty:puzzle.filter(v=>v===null).length
      };
    }
    const deep=solveWithContradiction(puzzle);
    return {
      ok:!!deep.ok, simple:false, hard:deep.hard||0, rounds:deep.rounds||0,
      empty:puzzle.filter(v=>v===null).length
    };
  }

  return {
    N, HALF, setConstraints, placementValid, propagate, logicSolve,
    solveWithContradiction, makePuzzle, analyse, consValid, uniqueValid,
    lineComplete, linesEqual, getConstraints:()=>constraints
  };
}

function encodeGrid(g){
  return g.map(v=>v===null?'.':v===1?'1':'0').join('');
}
function decodeGrid(s){
  return [...s].map(ch=>ch==='.'?null:ch==='1'?1:0);
}
function encodeCons(list){
  return list.map(cn=>[cn.a, cn.b, cn.horiz?1:0, cn.type==='eq'?1:0]);
}
function decodeCons(list){
  return list.map(([a,b,h,eq])=>({a,b,horiz:!!h, type:eq?'eq':'ne'}));
}

function hashId(str){
  let h=2166136261;
  for(let i=0;i<str.length;i++){
    h^=str.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  return (h>>>0).toString(36);
}

function difficultyScore(n, info){
  // 大きいほど難しい。サイズが土台、空きマスと背理法が上乗せ
  const byN={2:0,4:1600,6:3200,8:5000};
  const size=byN[n]??(n*400);
  const empty=info.empty||0;
  const hard=info.hard||0;
  const rounds=info.rounds||0;
  const contra=info.simple?0:800;
  return size + empty*18 + hard*90 + rounds*4 + contra;
}

const api={mulberry32, makeEngine, encodeGrid, decodeGrid, encodeCons, decodeCons, hashId, difficultyScore};
if(typeof module!=='undefined' && module.exports) module.exports=api;
else{
  globalThis.FireIceEngine=api;
}
