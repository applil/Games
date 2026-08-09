'use strict';
/* 気に入った面を、面を作り直しても持ち越すためのツール。
 *
 *   node tools/keep-levels.js [levels.json]
 *
 * tools/keep-levels.json に残したい盤面(XSB)を並べておくと、
 * その面の手応えにいちばん近い枠を差し替えて組み込む。
 * 難易度カーブを崩さないよう、性格の近い枠を選んで入れ替える。
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const X=require(path.join(__dirname,'xsb.js'));
const {solvableStates, regionRep, greedyPolicies, analyse, mulberry32}=E;

const TARGET=process.argv[2]||path.join(__dirname,'..','warehouse','levels.json');
const KEEP=path.join(__dirname,'keep-levels.json');

if(!fs.existsSync(KEEP)){
  console.log('tools/keep-levels.json がありません。持ち越す面はなしとして終了します。');
  process.exit(0);
}
const keep=JSON.parse(fs.readFileSync(KEEP,'utf8'));
const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));

// 盤面テキストから、出題に必要な情報を測り直す
function measure(board){
  const p=X.fromXSB(board.split('/'));
  const {grid,w,goals,boxes,player}=p;
  const dist=solvableStates(grid,w,goals,500000);
  if(!dist) return null;
  const reg=regionRep(grid,w,new Set(boxes),player);
  const a=analyse(grid,w,goals,dist,{boxes:boxes.slice().sort((x,y)=>x-y),rep:reg.rep,cells:reg.cells},
                  mulberry32(1), greedyPolicies(grid,w,goals));
  if(!a) return null;
  const rows=board.split('/');
  return {
    id: X.hashId(X.canonical(rows)),
    b: board,
    p: a.pushes,
    s: +a.score.toFixed(1),
    k: +a.score.toFixed(1),
    tr: Math.round(a.trapRatio*100),
    f: a.forced,
    g: a.greedyDied,
    og: a.offGoal?1:0,
    sh:'持ち越し', sz:'-', ar:'-', gp:'-', sp:'-', pl:'-', cl:'-',
    st: dist.size,
  };
}

let added=0, already=0, failed=0;
for(const item of keep){
  const board=typeof item==='string'?item:item.b;
  const note=(typeof item==='object'&&item.note)||'';
  const lv=measure(board);
  if(!lv){ console.log(`× 測れませんでした: ${note||board.slice(0,20)}`); failed++; continue; }
  if(data.levels.some(l=>l.id===lv.id)){
    console.log(`= すでに入っています (${lv.id}) ${note}`);
    already++;
    continue;
  }
  // 手応えがいちばん近い枠を探して差し替える(カーブを崩さないため)
  let best=-1, bestCost=Infinity;
  data.levels.forEach((l,i)=>{
    if(l.sh==='持ち越し') return;                    // 持ち越し同士は潰さない
    // 三項演算子は優先順位が低いので、必ず括弧でくくること
    const cost=Math.abs(l.p-lv.p)*1.6 + Math.abs(l.tr-lv.tr)*0.09
             + (((l.g>=3)!==(lv.g>=3)) ? 6 : 0)
             + ((((l.f>=2||l.og)?1:0)!==((lv.f>=2||lv.og)?1:0)) ? 3 : 0);
    if(cost<bestCost){ bestCost=cost; best=i; }
  });
  if(best<0){ failed++; continue; }
  const replaced=data.levels[best];
  data.levels[best]=lv;
  console.log(`+ 第${best+1}面に組み込みました (${lv.id}) 最短${lv.p}手 罠率${lv.tr}% 素直に詰む${lv.g}/3`
    +` ← 元は最短${replaced.p}手 罠率${replaced.tr}%  ${note}`);
  added++;
}
if(added){
  fs.writeFileSync(TARGET, JSON.stringify(data));
  console.log(`\n${TARGET} を更新しました (持ち越し ${added}面 / 既存 ${already}面 / 失敗 ${failed}面)`);
}else{
  console.log(`\n変更なし (既存 ${already}面 / 失敗 ${failed}面)`);
}
