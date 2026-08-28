'use strict';
/* 「動かなくなる」を探す道具。
 *
 *   node tools/stuck-check.js <入口> [面数]
 *   node tools/stuck-check.js ant 10
 *
 * なぜ要るか。tools/play-check.js は move(dir, true)(再生あつかい)で叩くので、
 * 蟻の演出と antBusy の道を一度も通らない。入力を止めているのは
 *   move(): !puzzle || finished || EDIT || antBusy
 * の4つで、antBusy は playAnts の done でしか false に戻らない。
 * ここでは本物の move(dir) で遊び、途中で
 *   ・裏に回る/戻る(visibilitychange)
 *   ・演出中に押す・戻す・面を変える
 * を混ぜて、antBusy や finished が戻らなくなる場面を探す。
 *
 * 先にローカルで静的サーバを立てておくこと:
 *   python3 -m http.server 8791 --bind 127.0.0.1
 */
const path=require('path');
const PW=process.env.PW || (()=>{
  for(const q of ['playwright','/opt/node22/lib/node_modules/playwright']){
    try{ require.resolve(q); return q; }catch(e){}
  }
  return 'playwright';
})();
const {chromium}=require(PW);
const dir=process.argv[2]||'ant';
const HOW=+(process.argv[3]||10);
const HOST=process.env.HOST||'http://localhost:8791';
const CHROME=process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

(async()=>{
  const b=await chromium.launch({executablePath:CHROME});
  const ctx=await b.newContext({viewport:{width:390,height:840}});
  const p=await ctx.newPage();
  const errs=[];
  p.on('pageerror',e=>errs.push('pageerror: '+String(e)));
  p.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });
  await p.goto(HOST+'/'+dir+'/?debug=1');
  await p.waitForFunction(()=>document.querySelectorAll('.board .cell').length>0,null,{timeout:20000});

  const out=await p.evaluate(async(HOW)=>{
    const rep=[];
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const busy=()=>(typeof antBusy!=='undefined') && antBusy;
    // antBusy が戻るのを待つ。戻らなければ詰まり
    const settle=async(limit=6000)=>{
      const t0=Date.now();
      while(busy() && Date.now()-t0<limit) await sleep(50);
      return !busy();
    };
    const state=()=>({player, boxes:boxes.slice().join(','), finished,
                      antBusy:(typeof antBusy!=='undefined')?antBusy:null});
    const DIRS=['up','down','left','right'];
    let seed=12345;
    const rnd=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; };

    const n=Math.min(HOW, LEVELS?LEVELS.length:HOW);
    for(let i=0;i<n;i++){
      startLevel(i);
      await sleep(30);
      for(let k=0;k<24 && !finished;k++){
        const d=DIRS[Math.floor(rnd()*4)];
        move(d);
        if(!await settle()){
          rep.push({面:i+1, 場面:'ふつうに押したあと '+d, ...state()});
          break;
        }
        // ときどき、演出の途中に割り込む
        if(k%7===3){
          move(DIRS[Math.floor(rnd()*4)]);      // 演出中の入力
          undo();                                // 演出中の取り消し
          if(!await settle()){
            rep.push({面:i+1, 場面:'演出中に押す/戻す', ...state()});
            break;
          }
        }
        // ときどき、裏へ回して戻す
        if(k%11===5){
          document.dispatchEvent(new Event('visibilitychange'));
          window.dispatchEvent(new Event('pagehide'));
          await sleep(60);
          window.dispatchEvent(new Event('pageshow'));
          document.dispatchEvent(new Event('visibilitychange'));
          if(!await settle()){
            rep.push({面:i+1, 場面:'裏へ回して戻したあと', ...state()});
            break;
          }
        }
      }
      // 面の切り替えで解けるか
      if(busy()){
        startLevel(i);
        await sleep(50);
        rep.push({面:i+1, 場面:'面を作り直して復帰したか', 復帰:!busy()});
      }
      finished=false;
      document.getElementById('overlay').classList.remove('show');
    }
    return rep;
  }, HOW);

  console.log(out.length ? JSON.stringify(out,null,1) : '詰まりは見つからなかった');
  if(errs.length) console.log('画面のエラー:\n'+errs.slice(0,10).join('\n'));
  else console.log('画面のエラー: なし');
  await b.close();
})();
