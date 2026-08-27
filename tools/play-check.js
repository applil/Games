'use strict';
/* パックの全面を「画面の操作だけで、記録どおりの手数で解けるか」確かめる。
 *
 *   node tools/play-check.js <入口> <パック名> <ルール名> [ローカルの住所]
 *   node tools/play-check.js bee spring duo
 *
 * なぜ要るか。ルールの中身は
 *   warehouse/rules.js … 探索・生成・検算が使う
 *   lib/game.js        … 画面が使う
 * の2か所にあり、片方だけ直すと「探索では解けるのに画面では解けない(または手数が違う)」
 * という食い違いが起きる。build-pack の検算は探索側しか見ないので、そこは通ってしまう。
 * ここでは探索が出した最短手順を、実際に画面の move() を叩いてなぞる。
 * 蟻の同僚や春の相方は画面が自前で動かすので、食い違えばここで必ず出る。
 *
 * 先にローカルで静的サーバを立てておくこと:
 *   python3 -m http.server 8791 --bind 127.0.0.1
 */
const path=require('path');
const fs=require('fs');
// playwright はこの環境では node の共有置き場にある。名前だけでは見つからない
const PW=process.env.PW || (()=>{
  for(const q of ['playwright','/opt/node22/lib/node_modules/playwright']){
    try{ require.resolve(q); return q; }catch(e){}
  }
  return 'playwright';
})();
const {chromium}=require(PW);
const {RULES}=require(path.join(__dirname,'..','warehouse','rules.js'));

const [dir, packName, ruleName]=process.argv.slice(2);
const HOST=process.argv[5] || 'http://localhost:8791';
const CHROME=process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
if(!dir || !packName || !ruleName){
  console.error('使い方: node tools/play-check.js <入口> <パック名> <ルール名>');
  process.exit(1);
}
const pack=JSON.parse(fs.readFileSync(
  path.join(__dirname,'..','warehouse','packs',packName+'.json'),'utf8'));
const rule=RULES[ruleName];
if(!rule){ console.error('知らないルール: '+ruleName); process.exit(1); }

/* 最短手順(押し手の列)を出す */
function solution(board){
  const p=rule.parse(board);
  let layer=[{st:rule.start(p), path:[]}];
  const seen=new Set([rule.key(layer[0].st)]);
  for(let d=0; d<=60; d++){
    for(const n of layer) if(rule.solved(p,n.st)) return n.path;
    const next=[];
    for(const n of layer) for(const m of rule.moves(p,n.st)){
      const k=rule.key(m.st);
      if(seen.has(k)) continue;
      seen.add(k);
      next.push({st:m.st, path:n.path.concat([{box:m.box, dir:m.dir}])});
    }
    if(!next.length) return null;
    layer=next;
  }
  return null;
}

(async()=>{
  const plans=pack.levels.map(l=>({id:l.id, p:l.p, path:solution(l.b)}));
  const b=await chromium.launch({executablePath:CHROME});
  const ctx=await b.newContext({viewport:{width:390,height:840}});
  const p=await ctx.newPage();
  const errs=[];
  p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(HOST+'/'+dir+'/?debug=1');
  await p.waitForFunction(()=>document.querySelectorAll('.board .cell').length>0,null,{timeout:20000});
  const res=await p.evaluate(async(plans)=>{
    const out=[];
    for(let i=0;i<plans.length;i++){
      const plan=plans[i];
      startLevel(i);
      await new Promise(r=>setTimeout(r,8));
      if(!plan.path){ out.push({面:i+1, 結果:'手順が出せない'}); continue; }
      const w=puzzle.w;
      const nameOf=d=>d===-w?'up':d===w?'down':d===-1?'left':'right';
      // 画面と同じ条件で「そこを通れるか」を見る
      const wall=n=>{
        if(puzzle.grid[n]) return true;
        if(boxes.includes(n)) return true;
        // 春。番でないミツバチは壁
        if(typeof bees!=='undefined' && bees.length && typeof turn!=='undefined'){
          for(let i=0;i<bees.length;i++) if(i!==turn && bees[i]===n) return true;
        }
        if(typeof coants!=='undefined' && coants.some && coants.some(a=>a.at===n)) return true;
        return false;
      };
      let ok=true, why='';
      for(const mv of plan.path){
        const from=mv.box-mv.dir;
        const prev=new Map(); const q=[player]; const seen=new Set([player]);
        while(q.length){
          const c=q.shift();
          if(c===from) break;
          for(const d of [1,-1,w,-w]){
            const n=c+d;
            if(n<0||n>=puzzle.grid.length||seen.has(n)||wall(n)) continue;
            seen.add(n); prev.set(n,c); q.push(n);
          }
        }
        if(!seen.has(from)){ ok=false; why='押す位置まで歩けない'; break; }
        const steps=[]; let c=from;
        while(c!==player){ const q2=prev.get(c); steps.unshift(c-q2); c=q2; }
        for(const d of steps) move(nameOf(d));
        if(player!==from){ ok=false; why='歩いた先が違う'; break; }
        move(nameOf(mv.dir), true);      // 再生あつかい。演出の待ちを飛ばす
      }
      out.push({面:i+1, 結果: ok ? ((checkWin()||finished)?'解けた':'未クリア') : why,
                手数:pushCount, 記録:plan.p});
      finished=false;
      document.getElementById('overlay').classList.remove('show');
    }
    return out;
  }, plans);
  const ng=res.filter(r=>r.結果!=='解けた' || r.手数!==r.記録);
  if(ng.length) console.log(JSON.stringify(ng.slice(0,5),null,1));
  console.log(ng.length
    ? `❌ ${ng.length}/${res.length}面で食い違い`
    : `✅ ${res.length}面すべて、記録どおりの手数で画面から解けた`);
  console.log('画面のエラー:', errs.length?errs.slice(0,2):'なし');
  await b.close();
  process.exit(ng.length?1:0);
})();
