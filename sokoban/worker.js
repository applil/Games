'use strict';
/* 問題生成をメインスレッドから切り離すためのワーカー。
   むずかしいは数秒かかることがあるので、ここで作って画面を止めない。 */
importScripts('engine.js');

self.onmessage = e => {
  const {id, difficulty, seed} = e.data;
  const t0 = Date.now();
  try{
    const cfg = SokobanEngine.DIFF[difficulty];
    if(!cfg) throw new Error('unknown difficulty: '+difficulty);
    const p = SokobanEngine.generate(seed>>>0, cfg);
    if(!p) { self.postMessage({id, error:'生成に失敗しました'}); return; }
    self.postMessage({
      id, difficulty, seed, ms: Date.now()-t0,
      puzzle:{
        grid:p.grid, w:p.w, h:p.h, W:p.W, H:p.H,
        boxes:p.boxes, goals:p.goals, player:p.player,
        pushes:p.pushes, lines:p.lines,
        style:p.style, goalStyle:p.goalStyle, nbox:p.nbox
      }
    });
  }catch(err){
    self.postMessage({id, error:String(err&&err.message||err)});
  }
};
