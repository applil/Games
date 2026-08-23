'use strict';
/* 印あわせ の面を、既存の面から作る。
 *
 *   node tools/gen-numbered.js [作る数] [出力先]
 *
 * 印あわせは、盤そのものは同じでよい。荷物と置き場に印を振るだけで、
 * 「どれをどこへ運ぶか」が固定され、同じ盤でも別の問題になる。
 * 振り方は荷物の数だけ順列があるので、既存の面1枚から何通りも作れる。
 *
 * 残すのは「番号を振ったせいで手数が変わった」ものだけ。
 * 変わらないなら、それは番号なしと同じ面でしかない。
 */
const fs=require('fs');
const path=require('path');
const {RULES}=require(path.join(__dirname,'..','warehouse','rules.js'));
const X=require(path.join(__dirname,'xsb.js'));

const WANT=+(process.argv[2]||24);
const OUT=process.argv[3]||path.join(__dirname,'..','warehouse','packs','number-raw.json');
const MIN_PUSH=+(process.env.MIN_PUSH||3);
const MAX_PUSH=+(process.env.MAX_PUSH||24);
const MAX_BOX=+(process.env.MAX_BOX||4);
const DUP=+(process.env.DUP||0.7);

const NUMS='123456789', GOALS='abcdefghi';
const rule=RULES.numbered;

function solve(b, cap){
  const p=rule.parse(b);
  let layer=[rule.start(p)];
  const seen=new Set([rule.key(layer[0])]);
  for(let d=0; d<=MAX_PUSH+4; d++){
    if(layer.some(s=>rule.solved(p,s))) return d;
    if(seen.size>(cap||300000)) return null;
    const next=[];
    for(const st of layer) for(const m of rule.moves(p,st)){
      const k=rule.key(m.st); if(seen.has(k)) continue;
      seen.add(k); next.push(m.st);
    }
    if(!next.length) return null;
    layer=next;
  }
  return null;
}
// 最短手順の押し手(重なりを見るため)
function pushSet(b){
  const p=rule.parse(b);
  let layer=[{st:rule.start(p), path:[]}];
  const seen=new Set([rule.key(layer[0].st)]);
  for(let d=0; d<=MAX_PUSH+4; d++){
    for(const n of layer) if(rule.solved(p,n.st)) return n.path;
    const next=[];
    for(const n of layer) for(const m of rule.moves(p,n.st)){
      const k=rule.key(m.st); if(seen.has(k)) continue;
      seen.add(k);
      const yx=i=>Math.floor(i/p.w)+','+(i%p.w);
      next.push({st:m.st, path:n.path.concat(m.n+':'+yx(m.box)+'>'+yx(m.to))});
    }
    if(!next.length) return null;
    layer=next;
  }
  return null;
}
const overlap=(A,B)=>{
  if(!A||!B) return 0;
  const sa=new Set(A), sb=new Set(B);
  let n=0; for(const v of sa) if(sb.has(v)) n++;
  const u=sa.size+sb.size-n;
  return u? n/u : 0;
};

/* 盤に印を振る。
   perm[k] は「k番目の置き場に、どの印を付けるか」。
   mark が渡されたときは、そこに入っている印だけを実際に付け、
   残りの荷物と置き場は印なし($ と .)のままにする。
   これで「全部に印が付いた面」と「一部だけの面」の両方を作れる */
function number(board, perm, mark){
  const rows=board.split('/');
  const w=Math.max(...rows.map(r=>r.length));
  const g=rows.map(r=>r.padEnd(w,'#').split(''));
  let bi=0;
  const goalCells=[];
  for(let y=0;y<g.length;y++) for(let x=0;x<w;x++){
    const c=g[y][x];
    if(c==='.'||c==='*'||c==='+') goalCells.push([y,x]);
  }
  // 印は 1,2,3… と続いていないといけない(飛ばすと、その番号が抜けた列になる)。
  // 一部だけに付けるときは、選んだものを前から詰めて番号を振り直す
  const order=mark ? [...mark].sort((a,b)=>a-b) : null;
  const at=order ? new Map(order.map((k,j)=>[k,j])) : null;
  const on=k=>!mark || at.has(k);
  const no=k=>at ? at.get(k) : k;
  for(let y=0;y<g.length;y++) for(let x=0;x<w;x++){
    const c=g[y][x];
    if(c==='$'||c==='*'){ const k=bi++; if(on(k)) g[y][x]=NUMS[no(k)]; }
  }
  goalCells.forEach(([y,x],k)=>{
    // すでに印(荷物)が置かれているマスは、置き場でもある。印あわせでは扱えないので捨てる
    if(NUMS.indexOf(g[y][x])>=0) throw new Error('置き場の上に荷物がある');
    if(on(perm[k])) g[y][x]=GOALS[no(perm[k])];
  });
  return g.map(r=>r.join('')).join('/');
}
const perms=a=>a.length<=1?[a]:a.flatMap((x,i)=>perms(a.filter((_,j)=>j!==i)).map(r=>[x,...r]));

/* 印を付ける荷物の組み合わせ。
   MARK=all  … 全部に付ける(今までどおり)
   MARK=part … 一部だけに付ける(1個以上、全部より少なく)。印なしが混ざる面になる
   数が少ないので、組み合わせは全部そのまま数え上げる */
const MARK=process.env.MARK||'all';
function markSets(n){
  if(MARK==='all') return [null];
  const out=[];
  for(let bits=1; bits<(1<<n)-1; bits++){          // 0(なし)と全部(1<<n)-1 は外す
    const s=new Set();
    for(let k=0;k<n;k++) if(bits&(1<<k)) s.add(k);
    out.push(s);
  }
  out.sort((a,b)=>b.size-a.size);                  // 印の多いものから試す
  return out;
}

const L=JSON.parse(fs.readFileSync(path.join(__dirname,'..','warehouse','levels.json'),'utf8')).levels;
let out=[];
try{ out=JSON.parse(fs.readFileSync(OUT,'utf8')).levels||[]; }catch(e){}
const ids=new Set(out.map(l=>l.id));
const sets=out.map(l=>pushSet(l.b)).filter(Boolean);

let tried=0;
for(const lv of L){
  if(out.length>=WANT) break;
  const nb=(lv.b.match(/[$*]/g)||[]).length;
  if(nb<2 || nb>MAX_BOX) continue;
  if(lv.p<MIN_PUSH || lv.p>MAX_PUSH) continue;
  if(lv.b.includes('*') || lv.b.includes('+')) continue;      // 置き場の上に荷物/人がある面は避ける
  const idx=[...Array(nb).keys()];
  let got=false;
  for(const mark of markSets(nb)){
    if(got || out.length>=WANT) break;
    for(const perm of perms(idx)){
      if(out.length>=WANT) break;
      tried++;
      let b; try{ b=number(lv.b, perm, mark); }catch(e){ got=true; break; }
      const d=solve(b);
      if(d===null || d<MIN_PUSH || d>MAX_PUSH) continue;
      if(d===lv.p) continue;                                  // 印が効いていない
      const id=X.hashId(X.canonical(b.split('/')));
      if(ids.has(id)) continue;
      const ps=pushSet(b);
      if(!ps) continue;
      let dup=false;
      for(const s of sets) if(overlap(ps,s)>=DUP){ dup=true; break; }
      if(dup) continue;
      ids.add(id); sets.push(ps);
      const marks=(b.match(/[1-9]/g)||[]).length;
      out.push({id, b, p:d, nbox:nb, nmark:marks,
                floors:(b.match(/[ .$*@+~1-9a-i]/g)||[]).length,
                from:lv.id, base:lv.p});
      out.sort((a,b2)=>a.p-b2.p);
      fs.mkdirSync(path.dirname(OUT),{recursive:true});
      fs.writeFileSync(OUT, JSON.stringify({rule:'numbered', levels:out}, null, 1));
      console.log(`${out.length}面目 ${d}手(印なしなら${lv.p}手) 荷物${nb}(うち印つき${marks})`);
      got=true;                                               // 同じ盤からは1つだけ
      break;
    }
  }
}
console.log(`\n${OUT} に ${out.length}面 (${tried}通り試した)`);
