'use strict';
/* 深い面を作るツール(新方式)。
 *
 *   node tools/gen-deep.js [欲しい数] [秒数] [seed] [1盤あたり] [出力先]
 *
 * これまでの gen-hard.js は全局面を数え上げるので、荷物7個・床60マスあたりで
 * 局面数が爆発して盤ごと捨てるしかなかった。45手を超える面が採れないのはそのため。
 *
 * こちらは探す役と確かめる役を分ける。
 *   探す   … tools/deep.js の幅を絞った逆探索(全部は持たない)
 *   確かめる… tools/astar.js で、その1局面だけを解いて最短手数を確定させる
 *
 * 環境変数:
 *   MIN_PUSH=45 MIN_MANO=0.30 NBOX=6,8 FLOORS=34,80
 *   SIZES=特大,超特大 SHAPES=2部屋,メガネ GOALS=四角詰め,二か所詰め
 *   BEAM=2500 TRIES=6 NODES=1.5e6
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {mulberry32}=E;
const S=require(path.join(__dirname,'shapes.js'));
const D=require(path.join(__dirname,'deep.js'));
const MO=require(path.join(__dirname,'motif.js'));
const {toXSB, canonical, hashId}=require(path.join(__dirname,'xsb.js'));

const WANT=+(process.argv[2]||10);
const SECS=+(process.argv[3]||600);
const SEED=+(process.argv[4]||Date.now()%1e9);
const PER_BOARD=+(process.argv[5]||2);
const OUT=process.argv[6]||path.join(__dirname,'deep-candidates.json');

const num=(k,d)=>process.env[k]!==undefined?+process.env[k]:d;
const pair=(k,d)=>process.env[k]!==undefined?process.env[k].split(',').map(Number):d;
const list=(k,d)=>process.env[k]?process.env[k].split(','):d;
const MIN_PUSH=num('MIN_PUSH',45);
const MIN_MANO=num('MIN_MANO',0.30);
const NBOX=pair('NBOX',[6,8]);
const FLOORS=pair('FLOORS',[34,80]);
const SIZES=list('SIZES',['特大','超特大']);
const SHAPES=list('SHAPES',['2部屋','3部屋','メガネ','連結回廊','空洞','ドーナツ','U字','迷路']);
const GOALS=list('GOALS',['四角詰め','二か所詰め','密集','疎な塊']);
const BEAM=num('BEAM',2500), TRIES=num('TRIES',6), NODES=num('NODES',1.5e6);

const LV=path.join(__dirname,'..','warehouse','levels.json');
const data=JSON.parse(fs.readFileSync(LV,'utf8'));
const seen=new Set(data.levels.map(l=>String(canonical(l.b.split('/')))));
const motifs=new Set();
for(const l of data.levels){ try{ motifs.add(MO.goalMotif(l.b)); }catch(e){} }
const rng=mulberry32(SEED);

const stat={boards:0, noShape:0, floors:0, noGoal:0, empty:0, dup:0, got:0};
const found=[];
const t0=Date.now();

while(found.length<WANT && (Date.now()-t0)/1000 < SECS){
  const layout=S.buildShape(rng,{size:SIZES[rng()*SIZES.length|0], shapes:SHAPES});
  if(!layout){ stat.noShape++; continue; }
  const {grid,w}=layout;
  const floors=[];
  for(let i=0;i<grid.length;i++) if(!grid[i]) floors.push(i);
  if(floors.length<FLOORS[0]||floors.length>FLOORS[1]){ stat.floors++; continue; }
  const nbox=NBOX[0]+(rng()*(NBOX[1]-NBOX[0]+1)|0);
  if(floors.length<nbox*4){ stat.floors++; continue; }
  const gp=S.pickGoals(layout, floors, nbox, rng, GOALS);
  if(!gp){ stat.noGoal++; continue; }
  stat.boards++;
  const t1=Date.now();
  let got=[];
  try{
    got=D.harvestDeep(grid, w, gp.goals, {
      minPush:MIN_PUSH, minMano:MIN_MANO, want:PER_BOARD,
      beam:BEAM, tries:TRIES, nodes:NODES, depth:Math.round(MIN_PUSH*2),
    });
  }catch(e){}
  if(!got.length){ stat.empty++; continue; }
  for(const g of got){
    const rows=toXSB({grid, w:layout.w, h:layout.h, boxes:g.boxes, goals:gp.goals, player:g.rep});
    const board=rows.join('/');
    const key=String(canonical(rows));
    const mo=MO.goalMotif(board);
    if(seen.has(key)||motifs.has(mo)){ stat.dup++; continue; }
    seen.add(key); motifs.add(mo); stat.got++;
    const lv={
      id:hashId(canonical(rows)), b:board, p:g.p,
      carry:g.carry, mano:g.mano, nbox,
      sh:layout.shape, sz:layout.size, gp:gp.pattern,
      ar:layout.W===layout.H?'正方':(layout.W>layout.H?'横長':'縦長'),
      // 囮・順番・強制は全局面の表が要るので、この方式では測っていない
      dec:null, acc:null, fo:null, tr:null, f:null, g:null, og:null,
      type:'深', pulls:g.pulls, boxes:g.boxes,
    };
    found.push(lv);
    console.log(`  ${lv.p}手 荷物${nbox} 経路${lv.mano} 引き${g.pulls} `
      +`床${floors.length} ${layout.shape}/${gp.pattern} `
      +`(${((Date.now()-t1)/1000).toFixed(0)}秒 ${found.length}面目 通算${((Date.now()-t0)/1000).toFixed(0)}秒)`);
  }
}

const el=(Date.now()-t0)/1000;
console.log(`\n${found.length}面 / ${el.toFixed(0)}秒 = 1面あたり${(el/Math.max(1,found.length)).toFixed(0)}秒`);
console.log(`盤${stat.boards}枚 (形なし${stat.noShape} 床の数で除外${stat.floors} 置き場なし${stat.noGoal})`
  +` → 収穫なし${stat.empty} 重複${stat.dup} 合格${stat.got}`);
if(found.length){
  fs.writeFileSync(OUT, JSON.stringify(found,null,1));
  console.log('\n 手数 荷物  盤     経路  引き  形/置き場');
  for(const lv of found.slice().sort((a,b)=>a.p-b.p)){
    const r=lv.b.split('/');
    console.log(String(lv.p).padStart(4)+String(lv.nbox).padStart(4)
      +((r[0].length-2)+'x'+(r.length-2)).padStart(8)+String(lv.mano).padStart(6)
      +String(lv.pulls).padStart(6)+'  '+lv.sh+'/'+lv.gp);
  }
  console.log('\n'+OUT+' に書き出しました');
}
