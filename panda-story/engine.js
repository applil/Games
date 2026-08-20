'use strict';
/* パンダと竹の生成・判定。ブラウザと Node の両方から使う。 */

const DIRS4=[[-1,0],[1,0],[0,-1],[0,1]];
const DIRS8=[
  [-1,-1],[-1,0],[-1,1],
  [0,-1],[0,1],
  [1,-1],[1,0],[1,1],
];

function mulberry32(a){
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

function shuffle(arr, rng){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(rng()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function generatePuzzle(n, div, rng){
  const target=Math.max(3, Math.floor((n*n)/div));
  for(let attempt=0; attempt<300; attempt++){
    const pandaSet=new Set();
    const cells=shuffle(
      Array.from({length:n*n},(_,i)=>[Math.floor(i/n), i%n]),
      rng
    );
    for(const [r,c] of cells){
      if(pandaSet.size>=target) break;
      let ok=true;
      for(const [dr,dc] of DIRS8){
        if(pandaSet.has(`${r+dr},${c+dc}`)){ ok=false; break; }
      }
      if(ok){
        const free=DIRS4.some(([dr,dc])=>{
          const rr=r+dr, cc=c+dc;
          return rr>=0 && rr<n && cc>=0 && cc<n && !pandaSet.has(`${rr},${cc}`);
        });
        if(free) pandaSet.add(`${r},${c}`);
      }
    }
    if(pandaSet.size<target) continue;

    const pandas=[...pandaSet].map(s=>s.split(',').map(Number));
    const adj=pandas.map(([r,c])=>
      shuffle(
        DIRS4
          .map(([dr,dc])=>[r+dr,c+dc])
          .filter(([rr,cc])=>rr>=0&&rr<n&&cc>=0&&cc<n&&!pandaSet.has(`${rr},${cc}`))
          .map(([rr,cc])=>`${rr},${cc}`),
        rng
      )
    );
    const matchCell=new Map();
    const tryAssign=(i, seen)=>{
      for(const cell of adj[i]){
        if(seen.has(cell)) continue;
        seen.add(cell);
        if(!matchCell.has(cell) || tryAssign(matchCell.get(cell), seen)){
          matchCell.set(cell, i);
          return true;
        }
      }
      return false;
    };
    let full=true;
    for(let i=0;i<pandas.length;i++){
      if(!tryAssign(i, new Set())){ full=false; break; }
    }
    if(!full) continue;

    const bambooSet=new Set(matchCell.keys());
    const rowClues=Array(n).fill(0);
    const colClues=Array(n).fill(0);
    for(const [r,c] of pandas){ rowClues[r]++; colClues[c]++; }
    return {n, bambooSet, rowClues, colClues, total:pandas.length};
  }
  return null;
}

function checkWin(puzzle, board){
  const {n, bambooSet, rowClues, colClues, total}=puzzle;
  const pandas=[];
  for(let r=0;r<n;r++)
    for(let c=0;c<n;c++)
      if(board[r][c]===1) pandas.push([r,c]);
  if(pandas.length!==total) return false;

  const pandaSet=new Set(pandas.map(([r,c])=>`${r},${c}`));
  for(const [r,c] of pandas)
    for(const [dr,dc] of DIRS8)
      if(pandaSet.has(`${r+dr},${c+dc}`)) return false;

  const rc=Array(n).fill(0), cc=Array(n).fill(0);
  for(const [r,c] of pandas){ rc[r]++; cc[c]++; }
  for(let i=0;i<n;i++)
    if(rc[i]!==rowClues[i] || cc[i]!==colClues[i]) return false;

  const adj=pandas.map(([r,c])=>
    DIRS4
      .map(([dr,dc])=>`${r+dr},${c+dc}`)
      .filter(k=>bambooSet.has(k))
  );
  const matchCell=new Map();
  const tryAssign=(i, seen)=>{
    for(const cell of adj[i]){
      if(seen.has(cell)) continue;
      seen.add(cell);
      if(!matchCell.has(cell) || tryAssign(matchCell.get(cell), seen)){
        matchCell.set(cell, i);
        return true;
      }
    }
    return false;
  };
  for(let i=0;i<pandas.length;i++)
    if(!tryAssign(i, new Set())) return false;
  return true;
}

function initState(puzzle){
  const {n, bambooSet}=puzzle;
  const isBamboo=(r,c)=>bambooSet.has(`${r},${c}`);
  const st=Array.from({length:n},(_,r)=>
    Array.from({length:n},(_,c)=>isBamboo(r,c)?3:0)
  );
  for(let r=0;r<n;r++)
    for(let c=0;c<n;c++)
      if(st[r][c]===0 && !DIRS4.some(([dr,dc])=>
        r+dr>=0 && r+dr<n && c+dc>=0 && c+dc<n && isBamboo(r+dr,c+dc)))
        st[r][c]=2;
  return st;
}

function applyPanda(puzzle, st, r, c){
  const n=puzzle.n;
  if(st[r][c]===2 || st[r][c]===3) return false;
  st[r][c]=1;
  for(const [dr,dc] of DIRS8){
    const rr=r+dr, cc=c+dc;
    if(rr<0||rr>=n||cc<0||cc>=n) continue;
    if(st[rr][cc]===1) return false;
    if(st[rr][cc]===0) st[rr][cc]=2;
  }
  return true;
}

function propagateState(puzzle, st, out){
  const {n, bambooSet, rowClues, colClues}=puzzle;
  const inB=(r,c)=>r>=0&&r<n&&c>=0&&c<n;
  let rounds=0;
  let changed=true;
  while(changed){
    changed=false;
    rounds++;
    for(let i=0;i<n;i++){
      for(const isRow of [true, false]){
        const clue=isRow?rowClues[i]:colClues[i];
        const cells=[];
        for(let k=0;k<n;k++){
          const r=isRow?i:k, c=isRow?k:i;
          cells.push([r,c]);
        }
        let p=0, unk=[];
        for(const [r,c] of cells){
          if(st[r][c]===1) p++;
          else if(st[r][c]===0) unk.push([r,c]);
        }
        if(p>clue) return false;
        if(p+unk.length<clue) return false;
        if(unk.length===0) continue;
        if(p===clue){
          for(const [r,c] of unk) st[r][c]=2;
          changed=true;
        }else if(p+unk.length===clue){
          for(const [r,c] of unk){
            if(!applyPanda(puzzle, st, r, c)) return false;
          }
          changed=true;
        }
      }
    }
    for(const key of bambooSet){
      const [br,bc]=key.split(',').map(Number);
      const nbs=DIRS4
        .map(([dr,dc])=>[br+dr, bc+dc])
        .filter(([rr,cc])=>inB(rr,cc) && st[rr][cc]!==3);
      if(nbs.some(([rr,cc])=>st[rr][cc]===1)) continue;
      const unk=nbs.filter(([rr,cc])=>st[rr][cc]===0);
      if(unk.length===0) return false;
      if(unk.length===1){
        if(!applyPanda(puzzle, st, unk[0][0], unk[0][1])) return false;
        changed=true;
      }
    }
  }
  if(out) out.rounds=(out.rounds||0)+rounds;
  return true;
}

const stComplete=st=>st.every(row=>row.every(v=>v!==0));

function deduce(puzzle, depth){
  const n=puzzle.n;
  const st=initState(puzzle);
  const out={rounds:0};
  if(!propagateState(puzzle, st, out)) return {solved:false, hard:0, rounds:out.rounds};
  let hard=0;
  if(depth>0){
    let progress=true;
    while(progress && !stComplete(st)){
      progress=false;
      outer:
      for(let r=0;r<n;r++) for(let c=0;c<n;c++){
        if(st[r][c]!==0) continue;
        const t1=st.map(row=>[...row]);
        if(!applyPanda(puzzle, t1, r, c) || !propagateState(puzzle, t1)){
          st[r][c]=2; hard++;
          if(!propagateState(puzzle, st, out)) return {solved:false, hard, rounds:out.rounds};
          progress=true; break outer;
        }
        const t2=st.map(row=>[...row]);
        t2[r][c]=2;
        if(!propagateState(puzzle, t2)){
          if(!applyPanda(puzzle, st, r, c) || !propagateState(puzzle, st, out))
            return {solved:false, hard, rounds:out.rounds};
          hard++;
          progress=true; break outer;
        }
      }
    }
  }
  if(!stComplete(st)) return {solved:false, hard, rounds:out.rounds};
  const board=st.map(row=>row.map(v=>v===1?1:0));
  return {solved:checkWin(puzzle, board), hard, rounds:out.rounds, board};
}

function packPuzzle(p){
  return {
    n:p.n,
    bamboo:[...p.bambooSet].sort(),
    row:p.rowClues,
    col:p.colClues,
    total:p.total
  };
}
function unpackPuzzle(o){
  return {
    n:o.n,
    bambooSet:new Set(o.bamboo),
    rowClues:o.row,
    colClues:o.col,
    total:o.total
  };
}

function fingerprint(p){
  return p.n+'|'+[...p.bambooSet].sort().join(';')+'|'+p.rowClues.join(',')+'|'+p.colClues.join(',');
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
  const size=n===5?0:n===7?2500:5500;
  const hard=info.hard||0;
  const rounds=info.rounds||0;
  const contra=info.depth?900:0;
  return size + hard*110 + rounds*8 + contra;
}

function computeHint(P, board){
  const {n, bambooSet, rowClues, colClues}=P;
  const inB=(r,c)=>r>=0&&r<n&&c>=0&&c<n;
  const res=deduce(P, 1);
  const sol=res.solved?res.board:null;

  if(sol){
    for(let r=0;r<n;r++) for(let c=0;c<n;c++){
      if(board[r][c]===1 && sol[r][c]!==1)
        return {r,c,val:0, msg:`${r+1}行${c+1}列のパンダは間違いのようです。いったん消したよ。`};
      if(board[r][c]===2 && sol[r][c]===1)
        return {r,c,val:0, msg:`${r+1}行${c+1}列の草マークは間違いのようです。ここには本当はパンダが入るよ。`};
    }
  }

  const st=Array.from({length:n},(_,r)=>
    Array.from({length:n},(_,c)=>
      bambooSet.has(`${r},${c}`)?3:board[r][c]===1?1:board[r][c]===2?2:0
    )
  );
  for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(st[r][c]===1)
    for(const [dr,dc] of DIRS8){
      const rr=r+dr, cc=c+dc;
      if(inB(rr,cc) && st[rr][cc]===0) st[rr][cc]=2;
    }
  const nearBamboo=(r,c)=>DIRS4.some(([dr,dc])=>inB(r+dr,c+dc)&&bambooSet.has(`${r+dr},${c+dc}`));
  for(let r=0;r<n;r++) for(let c=0;c<n;c++)
    if(st[r][c]===0 && !nearBamboo(r,c)) st[r][c]=2;

  const lines=[];
  for(let r=0;r<n;r++) lines.push({clue:rowClues[r], label:`${r+1}行目`, cells:Array.from({length:n},(_,c)=>[r,c])});
  for(let c=0;c<n;c++) lines.push({clue:colClues[c], label:`${c+1}列目`, cells:Array.from({length:n},(_,r)=>[r,c])});
  const lineStat=({cells})=>{
    let p=0; const unk=[];
    for(const [r,c] of cells){
      if(st[r][c]===1) p++;
      else if(st[r][c]===0) unk.push([r,c]);
    }
    return {p, unk};
  };

  for(const line of lines){
    const {p, unk}=lineStat(line);
    if(unk.length>0 && p+unk.length===line.clue){
      const [r,c]=unk[0];
      return {r,c,val:1, msg:`${r+1}行${c+1}列はパンダ。${line.label}は、置けないマスを除くと残り${unk.length}マスで、足りないパンダもちょうど${unk.length}匹だから。`};
    }
  }
  for(const key of bambooSet){
    const [br,bc]=key.split(',').map(Number);
    const nbs=DIRS4.map(([dr,dc])=>[br+dr,bc+dc]).filter(([r,c])=>inB(r,c)&&st[r][c]!==3);
    if(nbs.some(([r,c])=>st[r][c]===1)) continue;
    const cand=nbs.filter(([r,c])=>st[r][c]===0);
    if(cand.length===1){
      const [r,c]=cand[0];
      return {r,c,val:1, msg:`${r+1}行${c+1}列はパンダ。${br+1}行${bc+1}列の竹の相棒を置ける場所が、もうここしか残っていないから。`};
    }
  }
  for(const line of lines){
    const {p, unk}=lineStat(line);
    if(unk.length>0 && p===line.clue){
      const [r,c]=unk[0];
      return {r,c,val:2, msg:`${r+1}行${c+1}列は草。${line.label}はもうパンダが${line.clue}匹そろっているから。`};
    }
  }
  for(let r=0;r<n;r++) for(let c=0;c<n;c++){
    if(board[r][c]!==0 || bambooSet.has(`${r},${c}`)) continue;
    if(DIRS8.some(([dr,dc])=>inB(r+dr,c+dc)&&board[r+dr][c+dc]===1))
      return {r,c,val:2, msg:`${r+1}行${c+1}列は草。パンダの周囲8マス(ななめ含む)に他のパンダは置けないから。`};
    if(!nearBamboo(r,c))
      return {r,c,val:2, msg:`${r+1}行${c+1}列は草。上下左右に竹がないマスにパンダは置けないから。`};
  }
  if(sol){
    for(let r=0;r<n;r++) for(let c=0;c<n;c++){
      if(board[r][c]===0 && !bambooSet.has(`${r},${c}`)){
        const v=sol[r][c]===1?1:2;
        return {r,c,val:v, msg:`${r+1}行${c+1}列は${v===1?'パンダ':'草'}。ここから先は仮置きが必要な場面 — 逆を置くと必ずどこかで矛盾してしまうから(背理法)。`};
      }
    }
  }
  return null;
}

function hasAdjacentPanda(board){
  const n=board.length;
  for(let r=0;r<n;r++) for(let c=0;c<n;c++){
    if(board[r][c]!==1) continue;
    for(const [dr,dc] of DIRS8){
      const rr=r+dr, cc=c+dc;
      if(rr>=0&&rr<n&&cc>=0&&cc<n&&board[rr][cc]===1) return true;
    }
  }
  return false;
}

const api={
  DIRS4, DIRS8, mulberry32, shuffle, generatePuzzle, checkWin, deduce,
  packPuzzle, unpackPuzzle, fingerprint, hashId, difficultyScore, computeHint,
  hasAdjacentPanda
};
if(typeof module!=='undefined' && module.exports) module.exports=api;
else globalThis.PandaEngine=api;
