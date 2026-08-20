'use strict';
/* 炎と氷ステージ版の先頭に、ルールを1つずつ教えるチュートリアルを足す。
 * 既存の100面は後ろに残す。
 *
 *   node tools/make-fire-ice-tutorial.js
 */

const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','fire-ice-story','engine.js'));

const FILE=path.join(__dirname,'..','fire-ice-story','levels.json');

function idx(n,r,c){ return r*n+c; }

function pack(n, puz, sol, cons, lesson, extra){
  const eng=E.makeEngine(n, ()=>0);
  eng.setConstraints(cons);
  const info=eng.analyse(puz);
  if(!info.ok) throw new Error('解けない: '+lesson.slice(0,20));
  if(extra && extra.simple===true && !info.simple)
    throw new Error('単純推理で解けない（想定外）: '+lesson.slice(0,20));
  if(extra && extra.simple===false && info.simple)
    throw new Error('背理法なしで解けてしまう: '+lesson.slice(0,20));
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

function find6x6(pred, seed0){
  for(let s=seed0;s<seed0+8000;s++){
    const eng=E.makeEngine(6, E.mulberry32(s));
    const made=eng.makePuzzle(36, 0);
    if(!made) continue;
    const g=made.solution;
    for(let r=0;r<6;r++){
      const row=g.slice(r*6, r*6+6);
      if(!pred(row)) continue;
      // 目的の行を一番上へ。行の入れ替えは成立を壊さない
      const sol=g.slice();
      for(let c=0;c<6;c++){
        const tmp=sol[c];
        sol[c]=sol[r*6+c];
        sol[r*6+c]=tmp;
      }
      return sol;
    }
  }
  throw new Error('6x6の種が見つからない seed='+seed0);
}

function punch(sol, holes, cons, lesson, extra){
  const n=Math.sqrt(sol.length)|0;
  const puz=sol.slice();
  for(const [r,c] of holes) puz[idx(n,r,c)]=null;
  return pack(n, puz, sol, cons||[], lesson, extra);
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

function tutorials(){
  const simple={simple:true};
  const list=[];

  // 1 4×4 空き1マスをワンタップ（炎は1タップ）
  list.push(makeHand(
    ['1100','0011','1010','0101'],
    [[0,0]],
    [],
    '空いているマスを1回タップして、🔥を置いてみよう。各行・各列に🔥と🧊が2つずつ入るよ。',
    simple
  ));

  // 2 空き2マス。上は炎(1タップ)、下は氷(2タップ)
  list.push(makeHand(
    ['1100','0011','1010','0101'],
    [[0,0],[1,0]],
    [],
    '空いている2マスを埋めよう。1回タップで🔥、もう1回タップすると🧊になるよ。',
    simple
  ));

  // 3 3連続禁止だけで埋まる（🔥🔥□）
  list.push(makeHand(
    ['1100','0011','1010','0101'],
    [[0,2]],
    [],
    '同じマークは3つ続けて置けない。🔥🔥の隣は🧊になるよ。',
    simple
  ));

  // 4 氷と氷に挟まれたマスは炎
  list.push(makeHand(
    ['0101','1010','1100','0011'],
    [[0,1]],
    [],
    '🧊と🧊に挟まれたマスは、🧊を置くと3つ続いてしまう。だから🔥だよ。',
    simple
  ));

  // 5 = 初登場
  list.push(makeHand(
    ['1100','0011','1010','0101'],
    [[0,1]],
    [[0,0,0,1,'eq']],
    '＝でつながったマスは、同じマーク。隣の🔥と同じだから、ここも🔥だよ。',
    simple
  ));

  // 6 × 初登場
  list.push(makeHand(
    ['1010','0101','1001','0110'],
    [[0,1]],
    [[0,0,0,1,'ne']],
    '×でつながったマスは、違うマーク。隣が🔥だから、ここは🧊だよ。',
    simple
  ));

  // 7 同じ並びの行はダメ
  list.push(makeHand(
    ['1010','1001','0110','0101'],
    [[1,2],[1,3],[2,2],[2,3]],
    [],
    '同じ並びの行は作れない。1行目が🔥🧊🔥🧊なので、2行目を同じにすると負け。2行目は🔥🧊🧊🔥だよ。'
    // 残り2マス以上あるときの「同じ行はダメ」は、単純な1マス確定では解けない。
    // 人は行を見比べるだけだが、プログラム上は仮置きになる
  ));

  // 8 これまでの要素を順に使うやさしい面
  list.push(makeHand(
    ['1100','0011','1010','0101'],
    [[0,1],[0,2],[1,2],[3,1]],
    [[0,0,0,1,'eq'],[1,1,1,2,'ne'],[3,0,3,1,'ne']],
    '今までの技を順番に。＝、3連続、×、挟み。1マスずつ埋めていけるよ。',
    simple
  ));

  // 9 炎の隣の、＝でつながった2マス → 3連続を避けると両方氷
  list.push(makeHand(
    ['1001','0101','1010','0110'],
    [[0,1],[0,2]],
    [[0,1,0,2,'eq']],
    '🔥の隣に、＝でつながった2マスがある。ここに🔥を置くと3つ続いてしまうから、どちらも🧊だよ。',
    simple
  ));

  // 10 6x6 両端が炎 → その内側は氷
  {
    const sol=find6x6(row=>row[0]===1 && row[1]===0 && row[4]===0 && row[5]===1, 100);
    list.push(punch(
      sol,
      [[0,1],[0,4]],
      [],
      '6×6になったよ。行の両端が🔥なら、すぐ内側は🧊。内側を🔥にすると、残りが🧊だらけで3つ続いてしまうから。',
      simple
    ));
  }

  // 11 左から氷氷火 → 一番右は火（001101）
  {
    const sol=find6x6(row=>row[0]===0 && row[1]===0 && row[2]===1 && row[3]===1 && row[4]===0 && row[5]===1, 200);
    list.push(punch(
      sol,
      [[0,3],[0,4],[0,5]],
      [],
      '左が🧊🧊🔥のとき、残りは🔥🧊🔥しかない。一番右は🔥になるよ。',
      simple
    ));
  }

  list.push(...contradictionLessons());
  return list;
}

function main(){
  const data=JSON.parse(fs.readFileSync(FILE,'utf8'));
  const rest=data.levels.filter(lv=>!lv.tut);
  const tut=tutorials();
  for(const lv of tut){
    const eng=E.makeEngine(lv.n, ()=>0);
    eng.setConstraints(E.decodeCons(lv.c));
    const info=eng.analyse(E.decodeGrid(lv.p));
    if(!info.ok) throw new Error('再検証失敗 '+lv.id);
    console.log((lv.tut?'T':' ')+' n='+lv.n+' empty='+lv.empty+' hard='+lv.hard+' simple='+info.simple
      +'  '+(lv.lesson||'').slice(0,40));
  }
  data.levels=tut.concat(rest);
  data.generated=new Date().toISOString().slice(0,10);
  fs.writeFileSync(FILE, JSON.stringify(data));
  console.log('tutorial '+tut.length+' + rest '+rest.length+' = '+data.levels.length);
}

main();
