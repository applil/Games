'use strict';
/* パンダと竹ステージ版を組み立てる。
 * レッスン + 4×4パック + 本編100面。
 *
 *   node tools/make-panda-tutorial.js
 */

const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','panda-story','engine.js'));

const DIR=path.join(__dirname,'..','panda-story');
const FILE=path.join(DIR,'levels.json');
const PACK4=path.join(DIR,'pack-4x4.json');
const PACK100=path.join(DIR,'pack-original.json');

function make(n, bamboo, pandas, lesson){
  const bambooSet=new Set(bamboo);
  const row=Array(n).fill(0), col=Array(n).fill(0);
  for(const [r,c] of pandas){ row[r]++; col[c]++; }
  const p={n, bambooSet, rowClues:row, colClues:col, total:pandas.length};
  const board=Array.from({length:n},()=>Array(n).fill(0));
  for(const [r,c] of pandas) board[r][c]=1;
  if(!E.checkWin(p, board)) throw new Error('解答が不正: '+lesson.slice(0,30));
  const r0=E.deduce(p, 0);
  if(!r0.solved) throw new Error('単純推理で解けない: '+lesson.slice(0,30));
  const packed=E.packPuzzle(p);
  return {
    id:'tut-'+E.hashId(E.fingerprint(p)),
    ...packed,
    score:0,
    hard:0,
    rounds:r0.rounds,
    tut:true,
    lesson
  };
}

function tutorials(){
  return [
    make(4, ['0,1'], [[0,0]],
      '空いているマスを2回タップして🐼を置いてみよう。🎋の上下左右に1頭。数字はその行・列のパンダの数だよ。'),
    make(4, ['0,0'], [[1,0]],
      '🐼が来ないマスは1回タップして草にしておけるよ。1行目の数字は0だから、竹の右は草。'),
    make(4, ['0,1','0,2'], [[0,0],[0,3]],
      '1行の数字が2なら、その行に🐼が2頭。🎋が隣同士のときは、両端に置くとしっくりくるよ。'),
    make(4, ['0,1','1,0'], [[0,2],[2,0]],
      '🐼同士は縦・横・斜めにも隣り合えない。斜めに置きたくなっても、そこは空きにしておこう。'),
    make(4, ['0,1','3,2'], [[0,0],[3,3]],
      '🎋1本に🐼1頭。離れた竹は、それぞれいちばん近い空きマスでペアになるよ。'),
    make(4, ['0,0','2,2'], [[0,1],[2,1]],
      '列の数字も見る。この面は2列目が2だから、🐼は同じ列に2頭。'),
    make(4, ['0,3','3,0','3,3'], [[0,2],[2,0],[3,2]],
      '3頭になったよ。行と列の数字を足し合わせて、端から埋めていける。'),
    make(4, ['1,1','2,2'], [[1,0],[2,3]],
      '今までの技のまとめ。竹の隣、数字、隣り合わない。1マスずつ確定していけるよ。')
  ];
}

function main(){
  const intro=JSON.parse(fs.readFileSync(PACK4,'utf8')).levels.filter(lv=>!lv.tut && lv.n===4);
  const orig=JSON.parse(fs.readFileSync(PACK100,'utf8')).levels.filter(lv=>!lv.tut);
  const tut=tutorials();
  for(const lv of tut){
    const r=E.deduce(E.unpackPuzzle(lv), 1);
    if(!r.solved) throw new Error('再検証失敗 '+lv.id);
    console.log('T n='+lv.n+' total='+lv.total+' rounds='+lv.rounds+'  '+(lv.lesson||'').slice(0,40));
  }
  const seen=new Set();
  const levels=[];
  for(const lv of tut.concat(intro).concat(orig)){
    if(seen.has(lv.id)) throw new Error('id重複 '+lv.id);
    seen.add(lv.id);
    levels.push(lv);
  }
  fs.writeFileSync(FILE, JSON.stringify({
    v:1,
    generated:new Date().toISOString().slice(0,10),
    levels
  }));
  console.log('tutorial '+tut.length+' + 4x4 '+intro.length+' + original '+orig.length+' = '+levels.length);
}

main();
