'use strict';
/* 画面の操作だけで、記録どおりの手数で解けるかを確かめる。
 *
 *   node tools/verify-screen.js [パック名]
 *   node tools/verify-screen.js mark
 *
 * 探索(rules.js)と画面(lib/game.js)でルールが別実装なので、
 * 探索が解けても画面では手が違う、ということが起きうる。
 * 押す位置まで歩く経路を画面と同じ条件で探して move() を並べ、
 * 最後に表示されている手数が記録と一致するかを見る。
 *
 * あらかじめ静的サーバを立てておく:
 *   python3 -m http.server 8791 --bind 127.0.0.1
 */
const fs=require('fs');
const path=require('path');
const {RULES}=require(path.join(__dirname,'..','warehouse','rules.js'));
const {onePath}=require(path.join(__dirname,'mark-cross.js'));

const NAME=process.argv[2]||'mark';
const PORT=+(process.env.PORT||8791);
const ORIGIN='http://127.0.0.1:'+PORT;
const DIR={
  mark:'mark', water:'water', holes:'hole', slide:'ice',
  roll:'roll', duo:'bee', ants:'ant', summer:'water',
  squirrel:'hole', ice:'ice', spring:'bee', ant:'ant'
};

function loadPlaywright(){
  try{ return require('playwright'); }catch(e){}
  const home=process.env.HOME||'';
  const npx=path.join(home,'.npm','_npx');
  if(fs.existsSync(npx)){
    for(const d of fs.readdirSync(npx)){
      const p=path.join(npx,d,'node_modules','playwright');
      if(fs.existsSync(p)) return require(p);
    }
  }
  throw new Error('playwright が見つからない。npx playwright が使える環境なら、そのモジュールを NODE_PATH に入れてほしい');
}

function chromePath(){
  if(process.env.CHROME) return process.env.CHROME;
  const home=process.env.HOME||'';
  const mac=path.join(home,'Library','Caches','ms-playwright');
  if(fs.existsSync(mac)){
    const vers=fs.readdirSync(mac).filter(n=>n.startsWith('chromium-')).sort().reverse();
    for(const v of vers){
      const p=path.join(mac,v,'chrome-mac-arm64','Google Chrome for Testing.app','Contents','MacOS','Google Chrome for Testing');
      if(fs.existsSync(p)) return p;
      const p2=path.join(mac,v,'chrome-mac','Chromium.app','Contents','MacOS','Chromium');
      if(fs.existsSync(p2)) return p2;
    }
  }
  const linux='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if(fs.existsSync(linux)) return linux;
  return undefined;
}

const nameOf=(w, dir)=> dir===-w?'up':dir===w?'down':dir===-1?'left':'right';

function boxesOf(st){
  return st.num ? st.num.concat(st.free) : st.boxes;
}

/* 壁と荷物だけを見て歩く。印あわせに相方や蟻は居ない */
function walk(grid, w, boxSet, from, to){
  if(from===to) return [];
  const prev=new Map([[from, null]]);
  const q=[from];
  for(let i=0;i<q.length;i++){
    const at=q[i];
    for(const dir of [-w,w,-1,1]){
      const n=at+dir;
      if(n<0||n>=grid.length||grid[n]||boxSet.has(n)||prev.has(n)) continue;
      prev.set(n, {at, dir});
      if(n===to){
        const dirs=[];
        for(let x=n; x!==from; x=prev.get(x).at) dirs.push(prev.get(x).dir);
        dirs.reverse();
        return dirs;
      }
      q.push(n);
    }
  }
  return null;
}

function movesFor(board, ruleName){
  const rule=RULES[ruleName];
  const p=rule.parse(board);
  const path=ruleName==='marks' ? onePath(board, true) : null;
  if(!path) throw new Error('最短手順が出せない');
  let st=rule.start(p);
  let player=p.player;
  const names=[];
  for(const mv of path){
    const stand=mv.box-mv.dir;
    const boxSet=new Set(boxesOf(st));
    const dirs=walk(p.grid, p.w, boxSet, player, stand);
    if(!dirs) throw new Error('押す位置まで歩けない '+stand);
    for(const d of dirs) names.push(nameOf(p.w, d));
    names.push(nameOf(p.w, mv.dir));
    const cand=rule.moves(p, st).find(m=>m.box===mv.box && m.dir===mv.dir && m.to===mv.to);
    if(!cand) throw new Error('探索の手が局面から出ない');
    st=cand.st;
    player=mv.box;                 // 押したあと自機は荷物のいた場所へ
  }
  return {names, pushes:path.length};
}

async function main(){
  const packFile=path.join(__dirname,'..','warehouse','packs',NAME+'.json');
  const data=JSON.parse(fs.readFileSync(packFile,'utf8'));
  const ruleName=data.rule;
  const dir=DIR[NAME]||DIR[ruleName]||NAME;
  const {chromium}=loadPlaywright();
  const exe=chromePath();
  const browser=await chromium.launch({
    headless:true,
    executablePath:exe,
    args:['--lang=ja-JP']
  });
  const page=await browser.newPage();
  let bad=0;
  for(let i=0;i<data.levels.length;i++){
    const lv=data.levels[i];
    let seq;
    try{ seq=movesFor(lv.b, ruleName); }
    catch(e){
      console.log(`  ${i+1} ${lv.id} 手順が作れない: ${e.message}`);
      bad++; continue;
    }
    if(seq.pushes!==lv.p){
      console.log(`  ${i+1} ${lv.id} 探索が記録${lv.p}手に対し${seq.pushes}手`);
      bad++; continue;
    }
    await page.goto(ORIGIN+'/'+dir+'/?debug=1&lv='+(i+1), {waitUntil:'networkidle'});
    await page.waitForSelector('#board .cell');
    // 画面の move は function 宣言なので window から呼べる
    for(const name of seq.names){
      const ok=await page.evaluate(n=>{
        if(typeof move!=='function') return 'moveが無い';
        move(n, true);
        return null;
      }, name);
      if(ok){ console.log(`  ${i+1} ${lv.id} ${ok}`); bad++; break; }
    }
    const got=await page.evaluate(()=>document.getElementById('pushes').textContent);
    const shown=+got;
    if(shown!==lv.p){
      console.log(`  ${i+1} ${lv.id} 画面${shown}手 記録${lv.p}手`);
      bad++;
    }else{
      console.log(`  ${i+1} ${lv.id} ${lv.p}手 ✅`);
    }
  }
  await browser.close();
  console.log(bad ? `❌ ${bad}件の食い違い` : `✅ ${data.levels.length}面、画面でも記録どおりの手数で解けた`);
  process.exit(bad?1:0);
}

if(require.main===module) main().catch(e=>{ console.error(e); process.exit(1); });
module.exports={movesFor, walk};
