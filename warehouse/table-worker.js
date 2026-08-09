'use strict';
/* デバッグ用。全状態の表を裏で作る。
   大きい盤だと数秒かかるので、画面を止めないようここで計算する。 */
importScripts('engine.js');

self.onmessage = e => {
  const {id, grid, w, goals, cap} = e.data;
  try{
    const dist = WarehouseEngine.solvableStates(grid, w, goals, cap||3000000);
    self.postMessage({id, entries: dist ? Array.from(dist) : null});
  }catch(err){
    self.postMessage({id, entries:null, error:String(err&&err.message||err)});
  }
};
