'use strict';
/* 「怪しさ」の点数。モデレーションで付いた ✕ から見つけた傾向をそのまま式にしたもの。
 *
 * ✕が集中していたのは「盤が広いわりに荷物が少なく、使われない床が多い面」。
 * 手数・罠率・局面数は ✕ とほとんど関係がなかったので、点数には入れない。
 *
 *   node tools/suspect.js            … ラベル付きデータでの当たり具合を見る
 *   node tools/suspect.js <n>        … いまの面リストの上位n面を出す
 */
const fs=require('fs');
const path=require('path');
const X=require(path.join(__dirname,'xsb.js'));

// 盤面だけから測れる特徴(解かずに済むので速い)
function cheap(board){
  const p=X.fromXSB(board.split('/'));
  let floors=0;
  for(let i=0;i<p.grid.length;i++) if(!p.grid[i]) floors++;
  const W=p.w-2, H=p.h-2;
  return {
    W, H, area:W*H, floors, boxes:p.boxes.length,
    fill: floors/(W*H),
    floorsPerBox: floors/p.boxes.length,
  };
}

// 点数。大きいほど怪しい。境目は round1+round2 の ✕ の分布から取った
function suspect(board){
  const f=cheap(board);
  const s =
      2.0*Math.max(0, (f.floorsPerBox-7)/7)      // 荷物あたりの床が7を超えるほど
    + 1.5*Math.max(0, (f.area-30)/30)            // 内側が30マスを超えるほど
    + 1.5*Math.max(0, (0.75-f.fill)/0.35)        // 床の割合が0.75を下回るほど
    + 1.0*Math.max(0, (3-f.boxes))               // 荷物が3個未満なら
    ;
  return {score:+s.toFixed(2), ...f};
}

module.exports={cheap, suspect};

if(require.main===module){
  const arg=process.argv[2];
  if(!arg){
    // ラベル付きデータで、点数の高い順に並べたとき ✕ がどれだけ上に来るか
    const rows=[];
    for(const f of ['round1.json','round2.json']){
      const p=path.join(__dirname,'moderation',f);
      if(!fs.existsSync(p)) continue;
      for(const it of JSON.parse(fs.readFileSync(p,'utf8'))){
        if(rows.some(r=>r.id===it.id)) continue;
        rows.push({id:it.id, verdict:it.verdict, at:it.at, ...suspect(it.b)});
      }
    }
    rows.sort((a,b)=>b.score-a.score);
    const bad=rows.filter(r=>r.verdict==='bad').length;
    console.log(`ラベル付き ${rows.length}面 (✕ ${bad}面)\n`);
    console.log('点数の高い順に上からn面を取ったときの ✕ の入り具合');
    for(const n of [5,10,15,20,rows.length]){
      const top=rows.slice(0,n);
      const hit=top.filter(r=>r.verdict==='bad').length;
      console.log(`  上位${String(n).padStart(2)}面: ✕が${hit}面 (${Math.round(hit/n*100)}%) / 全✕の${Math.round(hit/bad*100)}%を拾えた`);
    }
    console.log('\n点数の高い順');
    console.log('判定  点数   広さ 床 荷物 床/荷 床割合  元面');
    for(const r of rows){
      console.log((r.verdict==='bad'?' ✕ ':' ★ ')
        +String(r.score).padStart(6)+String(r.area).padStart(6)
        +String(r.floors).padStart(4)+String(r.boxes).padStart(4)
        +r.floorsPerBox.toFixed(1).padStart(6)+r.fill.toFixed(2).padStart(7)
        +String(r.at).padStart(6));
    }
  }else{
    const n=+arg||30;
    const data=JSON.parse(fs.readFileSync(path.join(__dirname,'..','warehouse','levels.json'),'utf8'));
    const rows=data.levels.map((l,i)=>({at:i+1, ...suspect(l.b)}));
    rows.sort((a,b)=>b.score-a.score);
    console.log('怪しい順 上位'+n+'面');
    console.log(' 面   点数   広さ 床 荷物 床/荷 床割合');
    for(const r of rows.slice(0,n)){
      console.log(String(r.at).padStart(4)+String(r.score).padStart(7)+String(r.area).padStart(6)
        +String(r.floors).padStart(4)+String(r.boxes).padStart(4)
        +r.floorsPerBox.toFixed(1).padStart(6)+r.fill.toFixed(2).padStart(7));
    }
  }
}
