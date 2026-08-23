'use strict';
/* 本体を分けて、各ゲームの index.html から呼べるようにする。
 *
 *   node tools/split-game.js
 *
 * これまで warehouse/index.html は、見た目も骨組みも動きも入った2900行の1枚ものだった。
 * ルール違いのゲームを増やすたびに写しを作っていたが、それでは直しが本数ぶん増える。
 *
 * この道具は、その1枚ものを3つに割る:
 *   lib/game.css … 見た目(<style> の中身)
 *   lib/game.js  … 骨組み(<body> の中身)と動き(<script> の中身)
 *   各 index.html … 20行ほど。題と設定を書いて lib/ を読むだけ
 *
 * 骨組みは lib/game.js の中に文字列として持たせ、読み込んだ瞬間に body へ差し込む。
 * 外から取りに行くと、差し込む前に動きのほうが走ってしまうため。
 *
 * 原本は warehouse/index.html のまま。直したらこの道具を回すこと。
 */
const fs=require('fs');
const path=require('path');

const ROOT=path.join(__dirname,'..');
const SRC=path.join(ROOT,'warehouse','index.html');
const LIB=path.join(ROOT,'lib');

/* 各ゲームの頁。ここに1行足せば新しいルールのゲームが増える */
const GAMES=[
  {dir:'warehouse', pack:null,       title:'倉庫パズル', icon:'',
   desc:'🐥 が 📦 を置き場まで運ぶパズル。'},
  {dir:'water', pack:'summer',   title:'カニと水',   icon:'-summer',
   desc:'ダンボールは水に入りません。カニは歩けます'},
  {dir:'hole',  pack:'squirrel', title:'リスと穴',   icon:'-squirrel',
   desc:'置き場は穴。ドングリを埋めるまで通れません'},
  {dir:'ice',   pack:'ice',      title:'すべる氷',   icon:'-winter',
   desc:'氷は壁か氷にぶつかるまで滑ります'},
  {dir:'number',pack:'number',   title:'番号あわせ', icon:'',
   desc:'番号の合う置き場へ運びます'},
];

const src=fs.readFileSync(SRC,'utf8');
const lines=src.split('\n');
const at=t=>{ const i=lines.findIndex(l=>l.trim()===t); if(i<0) throw new Error('見つからない: '+t); return i; };
const s0=at('<style>'), s1=at('</style>');
const b0=at('<body>'), e0=at('<script src="engine.js"></script>');
const j0=lines.findIndex((l,i)=>i>e0 && l.trim()==='<script>');
const j1=lines.length-1-[...lines].reverse().findIndex(l=>l.trim()==='</script>');

const css=lines.slice(s0+1,s1).join('\n');
const markup=lines.slice(b0+1,e0).join('\n');
let code=lines.slice(j0+1,j1).join('\n');

/* 頁ごとの違いを、住所ではなく window.GAME から取るように書き換える。
   分けたあとは lib/game.js が原本になるので、この置き換えは一度きり */
const OLD_PACK=`const PACK=(()=>{
  const q=QS.get('pack');
  return (q && PACKS[q]) ? q : null;
})();`;
const NEW_PACK=`const PACK=(()=>{
  // 頁が決めた値が最優先。本編の頁だけ ?pack= での試し読みを許す
  const g=(window.GAME&&window.GAME.pack)||null;
  if(g && PACKS[g]) return g;
  const q=QS.get('pack');
  return (q && PACKS[q]) ? q : null;
})();`;
if(!code.includes(OLD_PACK)) throw new Error('PACK の決め方が見つからない');
code=code.replace(OLD_PACK, NEW_PACK);

// ASSET は FILE より先に決まっていないといけない。元の位置は後ろだったので、
// いったん消して PACKS の直前へ移す
const OLD_ASSET="// 絵や部品の置き場。ルール違いの写しでは ../warehouse/ に差し替わる\nconst ASSET='';";
if(code.includes(OLD_ASSET)) code=code.replace(OLD_ASSET,'');
else if(code.includes("const ASSET='';")) code=code.replace("const ASSET='';",'');
else throw new Error('ASSET が見つからない');
code=code.replace('const PACKS={',
  "/* 絵や部品の置き場。本編は '' 、ルール違いの頁は '../warehouse/' */\n"
+ "const ASSET=(window.GAME&&window.GAME.asset)||'';\nconst PACKS={");

const OLD_FILE="const FILE = PACK ? PACKS[PACK].file : 'levels.json';";
if(!code.includes(OLD_FILE)) throw new Error('FILE が見つからない');
code=code.replace(OLD_FILE,
  "const FILE = ASSET + (PACK ? PACKS[PACK].file : 'levels.json');");
// 面の置き場は warehouse/ の下にあるので、ASSET を前に付ければ足りる
code=code.replace(/file:'\.\.\/warehouse\/packs\//g, "file:'packs/");
code=code.replace(/'\.\.\/warehouse\/table-worker\.js'/g, "'table-worker.js'");
code=code.replace(/'table-worker\.js'/g, "ASSET+'table-worker.js'");

if(markup.includes('`')||markup.includes('${'))
  throw new Error('骨組みに ` か ${ が入っている。そのままでは文字列にできない');

fs.mkdirSync(LIB,{recursive:true});
fs.writeFileSync(path.join(LIB,'game.css'),
  '/* 倉庫パズルと、そのルール違いの見た目。\n'
+ '   原本は warehouse/index.html。直したら node tools/split-game.js を回すこと */\n'
+ css+'\n');

// 見出しは頁ごとに違う。骨組みは共通なので、読み込んだ直後に題で置き換える
code = "document.querySelector('header h1').textContent=document.title;\n" + code;

fs.writeFileSync(path.join(LIB,'game.js'),
  '/* 倉庫パズルと、そのルール違いの本体。\n'
+ '   原本は warehouse/index.html。直したら node tools/split-game.js を回すこと。\n\n'
+ '   頁ごとの違いは、読み込む前に window.GAME に入れておく:\n'
+ '     pack  … ルール違いの名前(本編は null)\n'
+ "     asset … 絵や部品の置き場(本編は '' 、ルール違いは '../warehouse/')  */\n"
+ "'use strict';\n"
+ 'document.body.insertAdjacentHTML("afterbegin", `'+markup+'`);\n'
+ code+'\n');

/* ---- 各ゲームの頁 ---- */
function page(g){
  const asset = g.dir==='warehouse' ? '' : '../warehouse/';
  const lib   = g.dir==='warehouse' ? '../lib/' : '../lib/';
  const eng   = asset+'engine.js';
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>${g.title}</title>
<link rel="apple-touch-icon" href="${asset}icon-180${g.icon}.png">
<link rel="icon" type="image/png" href="${asset}icon-512${g.icon}.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="${g.title}">
<meta name="theme-color" content="#f5f7fb">
<meta property="og:type" content="website">
<meta property="og:title" content="${g.title}">
<meta property="og:description" content="${g.desc}">
<meta property="og:image" content="https://applil.github.io/Games/warehouse/icon-512${g.icon}.png">
<meta property="og:image:width" content="512">
<meta property="og:image:height" content="512">
<meta name="twitter:card" content="summary">
<link rel="stylesheet" href="${lib}game.css">
</head>
<body>
<script>window.GAME={pack:${g.pack?`'${g.pack}'`:'null'}, asset:'${asset}'};</script>
<script src="${eng}"></script>
<script src="${lib}game.js"></script>
</body>
</html>
`;
}
for(const g of GAMES){
  const dir=path.join(ROOT,g.dir);
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'index.html'), page(g));
  console.log(`${g.dir}/index.html … ${g.title}${g.pack?' ('+g.pack+')':''}`);
}
console.log(`\nlib/game.css ${css.split('\n').length}行 / lib/game.js ${(markup+code).split('\n').length}行`);
