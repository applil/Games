'use strict';
/* ルール違いのゲームを、それぞれ独立した住所に置く。
 *
 *   node tools/build-pages.js
 *
 * ルール違いは倉庫パズルの着せ替えではなく別のゲームなので、
 * /Games/warehouse/ の下ではなく /Games/<名前>/ に置く。
 *
 * ただし中身はほぼ同じ2900行の1枚もの。7つに手で分けると直しが7倍になるので、
 * warehouse/index.html を唯一の原本にして、この道具が写しを作る。
 * 写しは手で触らないこと(次の実行で上書きされる)。
 *
 * 写すときに変えるのは3つだけ:
 *   ・パックを決め打ちにする(住所に ?pack= を付けなくてよい)
 *   ・engine.js などの相対の指し先を ../warehouse/ に直す
 *   ・題と説明を、そのゲームのものにする
 */
const fs=require('fs');
const path=require('path');

const ROOT=path.join(__dirname,'..');
const SRC=path.join(ROOT,'warehouse','index.html');

/* 出す先と、その中身。PACKS の並びと合わせること */
const PAGES=[
  {dir:'water', pack:'summer',   title:'カニと水',   emoji:'🦀📦',
   desc:'ダンボールは水に入りません。カニは歩けます'},
  {dir:'hole',  pack:'squirrel', title:'リスと穴',   emoji:'🐿️🌰',
   desc:'置き場は穴。ドングリを埋めるまで通れません'},
];

const src=fs.readFileSync(SRC,'utf8');
let made=0;
for(const pg of PAGES){
  let s=src;

  // 1) パックを決め打ちにする。住所に付けなくても、そのゲームとして開く
  s=s.replace(
    /const PACK=\(\(\)=>\{[\s\S]*?\}\)\(\);/,
    `const PACK='${pg.pack}';   // この住所は ${pg.title} 専用(tools/build-pages.js が入れた)`);

  // 2) 相対の指し先を ../warehouse/ に直す
  s=s.replace(/src="engine\.js"/g, 'src="../warehouse/engine.js"');
  s=s.replace(/'table-worker\.js'/g, "'../warehouse/table-worker.js'");
  s=s.replace(/href="icon-180([^"]*)\.png"/g, 'href="../warehouse/icon-180$1.png"');
  s=s.replace(/href="icon-512([^"]*)\.png"/g, 'href="../warehouse/icon-512$1.png"');
  s=s.replace(/content="([^"]*)icon-512([^"]*)\.png"/g, 'content="$1warehouse/icon-512$2.png"');
  s=s.replace(/file:'packs\//g, "file:'../warehouse/packs/");
  s=s.replace("const ASSET='';", "const ASSET='../warehouse/';");
  // 本編に戻る道は無いので、ルール版の出入りボタンは使わない
  s=s.replace(/\$\('btnPack'\)\.textContent = PACK[\s\S]*?\}\);\n/,
    "$('btnPack').style.display='none';   // ルール違いは独立した住所なので、切り替えは出さない\n");

  // 3) 題と説明
  s=s.replace(/<title>[^<]*<\/title>/, `<title>${pg.title}</title>`);
  s=s.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${pg.title}$2`);
  s=s.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${pg.desc}$2`);
  s=s.replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/, `$1${pg.title}$2`);
  s=s.replace(/(<h1[^>]*>)[^<]*(<\/h1>)/, `$1${pg.title}$2`);

  // 4) 頭に、写しであることを書いておく
  s=s.replace('<!DOCTYPE html>',
    '<!DOCTYPE html>\n<!-- この写しは tools/build-pages.js が作っています。手で直さないこと。\n'
    +'     原本は warehouse/index.html。直すときはそちらを直して、この道具を回す -->');

  const dir=path.join(ROOT,pg.dir);
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'index.html'), s);
  console.log(`${pg.dir}/index.html … ${pg.title} (${pg.pack})`);
  made++;
}
console.log(`\n${made}件を書き出しました。原本は warehouse/index.html`);
