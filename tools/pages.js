'use strict';
/* 各ゲームの入口ページを書き出す。
 *
 *   node tools/pages.js
 *
 * 本体は lib/game.css と lib/game.js にある。入口は27行の殻で、
 * 題とアイコンと「どのルールか」を書いて lib/ を読むだけ。
 * 新しいルールのゲームを足すときは、下の GAMES に1行足して回す。
 */
const fs=require('fs');
const path=require('path');
const ROOT=path.join(__dirname,'..');

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
  {dir:'mark',  pack:'mark',     title:'印あわせ', icon:'',
   desc:'印のちがう置き場にだけ置けません。印の無いものは万能'},
  {dir:'roll',  pack:'roll',     title:'ころがし',   icon:'-beetle',
   desc:'押すたびに90度まわります。向きを戻して置きましょう'},
  {dir:'bee',   pack:'spring',   title:'2匹のミツバチ', icon:'-spring',
   desc:'ミツバチは2匹。1回押すごとに交代します'},
  {dir:'ant',   pack:'ant',      title:'はたらきアリ', icon:'',
   desc:'同僚のアリも、あなたが押すたびに1つ押します'},
];

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
<script src="${asset}rules.js"></script>
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

console.log(`\n${GAMES.length}件の入口を書き出しました`);
