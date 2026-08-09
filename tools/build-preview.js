'use strict';
/* 手元のブラウザから開けるプレビューを1枚のHTMLにまとめるツール。
 *
 *   node tools/build-preview.js [出力先.html]
 *
 * 外部ファイルを一切読みに行かないようにする:
 *   - engine.js を埋め込む
 *   - levels.json を埋め込み、読み込み口を差し替える
 *   - table-worker.js は Blob から起動する(デバッグモードのみ使う)
 * さらに、Artifact は <head> を自前で用意するので、head の中身は本文側に移す。
 */
const fs=require('fs');
const path=require('path');
const ROOT=path.join(__dirname,'..','warehouse');
const OUT=process.argv[2]||path.join(__dirname,'..','..','warehouse-preview.html');

const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
let html=read('index.html');
const engine=read('engine.js');
const worker=read('table-worker.js');
const levels=read('levels.json');

const must=(before,after,what)=>{
  if(before===after) throw new Error('差し替えられませんでした: '+what);
  return after;
};
// 差し込む中身に $' などが混じると String.replace が別の意味に取ってしまう
// (エンジンには荷物を表す '$' が入っている)。必ず関数で渡すこと。
const swap=(src,from,to,what)=>must(src, src.replace(from,()=>to), what);

// 1. 外側の骨格を外して、本文だけにする
html=must(html, html.replace(/^[\s\S]*?<head>\s*/,''), '<head> より前');
html=must(html, html.replace(/<\/body>\s*<\/html>\s*$/,''), '</body></html>');
html=must(html, html.replace(/<meta[^>]*>\s*/g,''), '<meta>');
html=must(html, html.replace(/<title>[\s\S]*?<\/title>\s*/,''), '<title>');
html=must(html, html.replace(/<\/head>\s*<body>\s*/,''), '</head><body>');

// 2. engine.js を埋め込む
html=swap(html, '<script src="engine.js"></script>', '<script>\n'+engine+'\n</script>', 'engine.js');

// 3. 面データを埋め込んで fetch を差し替える
const embed='<script>\nwindow.__EMBED={"levels.json":'+levels+'};\n</script>\n';
html=swap(html,
  "  return fetch(name).then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); });",
  "  return window.__EMBED[name] ? Promise.resolve(window.__EMBED[name])\n"
  +"                             : Promise.reject(new Error(name+' は埋め込まれていません'));",
  'loadJSON');
html=embed+html;

// 4. worker は Blob から起動する(engine.js も中に入れてしまう)
const workerSrc=swap(worker, "importScripts('engine.js');", engine, 'worker の importScripts');
html=swap(html, "new Worker('table-worker.js')",
  'new Worker(URL.createObjectURL(new Blob([window.__WORKER_SRC],{type:"text/javascript"})))', 'Worker');
html='<script>\nwindow.__WORKER_SRC='+JSON.stringify(workerSrc)+';\n</script>\n'+html;

// 5. メニューへのリンクは、プレビューでは本番のトップに向ける
html=swap(html, 'href="../"', 'href="https://applil.github.io/Games/" target="_blank" rel="noopener"', 'メニューのリンク');

fs.writeFileSync(OUT, html);
console.log(`${OUT} に書き出しました (${(html.length/1024).toFixed(0)}KB)`);
