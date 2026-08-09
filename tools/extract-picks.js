'use strict';
/* 旧2000面から「面白い面」だけを抜き出して、よりぬき版の面リストを作る。
 *
 *   node tools/extract-picks.js <元のlevels.json> [出力先]
 *
 * 条件は、気に入っていただいた面(旧第1905面)と同系統:
 *   ・最短8手以上           … 一発ネタではなく多段構え
 *   ・素直な手筋が3種とも詰む … 寄せるだけでは解けない
 *   ・罠率35%以上           … 打てる手の3分の1以上が即詰み
 *   ・正解が一本道 または 置き場から一度どける必要がある
 * 難しい順ではなく、手応えが散るよう手数順に並べる。
 */
const fs=require('fs');
const path=require('path');

const SRC=process.argv[2];
const OUT=process.argv[3]||path.join(__dirname,'..','warehouse','levels-picks.json');
if(!SRC){ console.error('元の levels.json を指定してください'); process.exit(1); }

const src=JSON.parse(fs.readFileSync(SRC,'utf8'));
const like=x=>x.p>=8 && x.g>=3 && x.tr>=35 && (x.f>=2||x.og);
const picks=src.levels.filter(like);

// 手数の短い順。同じ手数なら罠率の低い順(取りつきやすい方から)
picks.sort((a,b)=>(a.p-b.p)||(a.tr-b.tr));

fs.writeFileSync(OUT, JSON.stringify({
  version:1,
  title:'よりぬき',
  note:'旧2000面から、手応えのある面だけを抜き出したもの',
  count:picks.length,
  levels:picks,
}));
console.log(`${SRC} の ${src.levels.length}面から ${picks.length}面を抜き出しました`);
console.log(`  手数: ${Math.min(...picks.map(x=>x.p))}〜${Math.max(...picks.map(x=>x.p))}手 (平均 ${(picks.reduce((s,x)=>s+x.p,0)/picks.length).toFixed(1)}手)`);
console.log(`  罠率: ${Math.min(...picks.map(x=>x.tr))}〜${Math.max(...picks.map(x=>x.tr))}% (平均 ${(picks.reduce((s,x)=>s+x.tr,0)/picks.length).toFixed(0)}%)`);
console.log(`  → ${OUT}`);
