'use strict';
/* 印あわせの面が「入れ替え」を使うかを見る。
 *
 *   node tools/mark-cross.js [パック]
 *   node tools/mark-cross.js warehouse/packs/mark.json
 *   node tools/mark-cross.js --hunt [作る数] [出力先]
 *
 * 「入れ替え」とは、印つきの荷物を印の無い置き場へ置き、印の無い荷物を
 * 印つきの置き場へ置くこと。印つきは自分の印か印の無い置き場にしか
 * 入れないので、この2つは必ず同時に起きる。
 *
 * 最短で解けた最終配置を全部集め、入れ替えがあるかどうかを数える。
 *   必須   … 最短の最終配置がどれも入れ替えを使っている
 *   選べる … 入れる配置と、印どおりに置く配置が同じ手数である
 *   使わない … 最短では入れ替えが1つも出てこない
 *              (印の無い荷物が無い面は、入れ替えようが無い)
 *
 * 手順ではなく最終配置を見る。同じ置き方に至る道が何本あっても、
 * 入れ替えを使ったかどうかは置き方で決まるから。
 */
const fs=require('fs');
const path=require('path');
const {RULES}=require(path.join(__dirname,'..','warehouse','rules.js'));
const X=require(path.join(__dirname,'xsb.js'));

const rule=RULES.marks;
const MARKS='ABCDEFGHI', GOALS='abcdefghi';
const NUMS='123456789';
const MAX_PUSH=+(process.env.MAX_PUSH||24);
const CAP=+(process.env.CAP||300000);
const DUP=+(process.env.DUP||0.7);

function yx(p, i){ return Math.floor(i/p.w)+','+(i%p.w); }

/* その最終配置が入れ替えを使っているか。
   印つきの荷物が印の無い置き場に乗っていれば、必ずどこかの印つき置き場を
   印の無い荷物が埋めている */
function usesCross(p, st){
  const open=new Set(p.open);
  return st.num.some(b=>open.has(b));
}

/* 印どおり(A→a, B→b, …)。印の無い荷物は残った置き場ならどこでもよい */
function isMatch(p, st){
  for(let k=0;k<st.num.length;k++) if(st.num[k]!==p.slot[k]) return false;
  return true;
}

function placeKey(st){
  return st.num.join(',')+'|'+st.free.join(',');
}

function describe(p, st){
  const slotAt=new Map();
  p.slot.forEach((g,k)=>slotAt.set(g,k));
  const open=new Set(p.open);
  const dest=b=>{
    const n=slotAt.get(b);
    if(n!==undefined) return GOALS[n];
    if(open.has(b)) return '.';
    return '?';
  };
  const parts=[];
  for(let k=0;k<st.num.length;k++) parts.push(MARKS[k]+'→'+dest(st.num[k]));
  for(const b of st.free) parts.push('$→'+dest(b));
  return parts.join(' ');
}

/* 最短の最終配置を全部集め、入れ替えの有無で分ける。
   あわせて「印どおりに置いたとき何手か」も出す(必須の面が、合わせても
   解けるが長いのか、合わせでは解けないのかを区別するため) */
function classify(board, cap){
  const p=rule.parse(board);
  const nbox=p.num.length+p.free.length;
  const nmark=p.num.length;
  const start=rule.start(p);
  let layer=[start];
  const seen=new Set([rule.key(start)]);
  let D=null, Dmatch=null;
  const shortest=[];          // 最短の最終配置(置き方の重複なし)
  const seenPlace=new Set();
  for(let d=0; d<=MAX_PUSH+4; d++){
    for(const st of layer){
      if(!rule.solved(p, st)) continue;
      if(D===null) D=d;
      if(d===D){
        const pk=placeKey(st);
        if(!seenPlace.has(pk)){ seenPlace.add(pk); shortest.push(st); }
      }
      if(Dmatch===null && isMatch(p, st)) Dmatch=d;
    }
    if(D!==null && (Dmatch!==null || nmark===0)) break;
    if(seen.size>(cap||CAP)) break;
    const next=[];
    for(const st of layer) for(const m of rule.moves(p, st)){
      const k=rule.key(m.st);
      if(seen.has(k)) continue;
      seen.add(k); next.push(m.st);
    }
    if(!next.length) break;
    layer=next;
  }
  if(D===null) return {ok:false, nbox, nmark, why:'解けないか上限超え'};

  let nCross=0;
  const places=[];
  for(const st of shortest){
    const cross=usesCross(p, st);
    if(cross) nCross++;
    places.push({cross, match:isMatch(p, st), how:describe(p, st)});
  }
  let kind;
  if(nmark===0 || p.free.length===0) kind='使わない';
  else if(nCross===shortest.length) kind='必須';
  else if(nCross===0) kind='使わない';
  else kind='選べる';

  return {
    ok:true, p:D, match:Dmatch, nbox, nmark, nfree:p.free.length,
    nPlace:shortest.length, nCross, kind, places, states:seen.size
  };
}

/* 最短手順を1本だけ取る(画面検証用)。入れ替え必須の面では、
   入れ替えを使う最終配置へ向かう道を優先する */
function onePath(board, wantCross){
  const p=rule.parse(board);
  let layer=[{st:rule.start(p), path:[]}];
  const seen=new Set([rule.key(layer[0].st)]);
  let fallback=null;
  for(let d=0; d<=MAX_PUSH+4; d++){
    for(const n of layer){
      if(!rule.solved(p, n.st)) continue;
      if(wantCross && !usesCross(p, n.st)){
        if(!fallback) fallback=n.path;
        continue;
      }
      return n.path;
    }
    const next=[];
    for(const n of layer) for(const m of rule.moves(p, n.st)){
      const k=rule.key(m.st);
      if(seen.has(k)) continue;
      seen.add(k);
      next.push({st:m.st, path:n.path.concat({box:m.box, dir:m.dir, to:m.to, n:m.n})});
    }
    if(!next.length) break;
    layer=next;
  }
  return fallback;
}

function pushSet(board){
  const p=rule.parse(board);
  let layer=[{st:rule.start(p), path:[]}];
  const seen=new Set([rule.key(layer[0].st)]);
  for(let d=0; d<=MAX_PUSH+4; d++){
    for(const n of layer) if(rule.solved(p, n.st)) return n.path;
    const next=[];
    for(const n of layer) for(const m of rule.moves(p, n.st)){
      const k=rule.key(m.st);
      if(seen.has(k)) continue;
      seen.add(k);
      next.push({st:m.st, path:n.path.concat(m.n+':'+yx(p,m.box)+'>'+yx(p,m.to))});
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

function reportLine(i, lv, r){
  if(!r.ok) return `${String(i+1).padStart(3)} ${lv.id}  ${r.why}`;
  const mark=r.nmark+'/'+r.nbox;
  const match=r.match===null ? '合わせ不能' : (r.match===r.p ? '合わせ同手' : `合わせ${r.match}手`);
  const sample=r.places.filter(x=>x.cross).map(x=>x.how)[0]
            || r.places.map(x=>x.how)[0] || '';
  return `${String(i+1).padStart(3)} ${lv.id}  ${String(r.p).padStart(2)}手 印${mark}  ${r.kind}  最短${r.nPlace}通り(入替${r.nCross})  ${match}  ${sample}`;
}

function analyze(file){
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  const levels=data.levels||[];
  const counts={必須:0, 選べる:0, 使わない:0};
  const rows=[];
  levels.forEach((lv,i)=>{
    const r=classify(lv.b);
    rows.push({id:lv.id, p:lv.p, from:lv.from, nbox:lv.nbox, nmark:lv.nmark, ...r});
    if(r.ok) counts[r.kind]++;
    console.log(reportLine(i, lv, r));
  });
  console.log('\n'+levels.length+'面  必須 '+counts.必須+'  選べる '+counts.選べる+'  使わない '+counts.使わない);
  return {file, counts, levels:rows};
}

/* ---- 必須の面を本編の盤から探す ----
   印あわせは盤そのものは同じでよく、印の付け方で別の問題になる。
   残すのは「入れ替えが必須」なものだけ。ふつうと同じ手数でも、
   印どおりに置くと長くなるなら、印は飾りではなく罠なので残す。
   (1つの印＋印なし1つ、という一番単純な入れ替えは、ふつうと同じ手数に
    しかなり得ない。印どおりも入れ替えもどちらも合法だから) */
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
  const order=mark ? [...mark].sort((a,b)=>a-b) : null;
  const at=order ? new Map(order.map((k,j)=>[k,j])) : null;
  const on=k=>!mark || at.has(k);
  const no=k=>at ? at.get(k) : k;
  for(let y=0;y<g.length;y++) for(let x=0;x<w;x++){
    const c=g[y][x];
    if(c==='$'||c==='*'){ const k=bi++; if(on(k)) g[y][x]=NUMS[no(k)]; }
  }
  goalCells.forEach(([y,x],k)=>{
    if(NUMS.indexOf(g[y][x])>=0) throw new Error('置き場の上に荷物がある');
    if(on(perm[k])) g[y][x]=GOALS[no(perm[k])];
  });
  return g.map(r=>r.join('')).join('/');
}
const perms=a=>a.length<=1?[a]:a.flatMap((x,i)=>perms(a.filter((_,j)=>j!==i)).map(r=>[x,...r]));
function markSets(n){
  // 印なしが0個(全部に印)と、印が0個は入れ替えようが無いので外す
  const out=[];
  for(let bits=1; bits<(1<<n)-1; bits++){
    const s=new Set();
    for(let k=0;k<n;k++) if(bits&(1<<k)) s.add(k);
    out.push(s);
  }
  out.sort((a,b)=>a.size-b.size);   // 印の少ないほうから。入れ替えが読みやすい
  return out;
}

function hunt(want, outFile, existing){
  const L=JSON.parse(fs.readFileSync(path.join(__dirname,'..','warehouse','levels.json'),'utf8')).levels;
  let out=[];
  try{ out=JSON.parse(fs.readFileSync(outFile,'utf8')).levels||[]; }catch(e){}
  const ids=new Set(out.map(l=>l.id).concat((existing||[]).map(l=>l.id)));
  const froms=new Set(out.map(l=>l.from).filter(Boolean).concat((existing||[]).map(l=>l.from).filter(Boolean)));
  const sets=(out.concat(existing||[])).map(l=>l.b && pushSet(l.b)).filter(Boolean);

  const MIN_PUSH=+(process.env.MIN_PUSH||4);
  const MAX_BOX=+(process.env.MAX_BOX||4);
  let tried=0;
  for(const lv of L){
    if(out.length>=want) break;
    if(froms.has(lv.id)) continue;
    const nb=(lv.b.match(/[$*]/g)||[]).length;
    if(nb<2 || nb>MAX_BOX) continue;
    if(lv.p<MIN_PUSH || lv.p>MAX_PUSH) continue;
    if(lv.b.includes('*') || lv.b.includes('+')) continue;
    const idx=[...Array(nb).keys()];
    let got=false;
    for(const mark of markSets(nb)){
      if(got || out.length>=want) break;
      for(const perm of perms(idx)){
        if(out.length>=want) break;
        tried++;
        let b; try{ b=number(lv.b, perm, mark); }catch(e){ got=true; break; }
        const r=classify(b);
        if(!r.ok || r.kind!=='必須') continue;
        if(r.p<MIN_PUSH || r.p>MAX_PUSH) continue;
        const id=X.hashId(X.canonical(b.split('/')));
        if(ids.has(id)) continue;
        const ps=pushSet(b);
        if(!ps) continue;
        let dup=false;
        for(const s of sets) if(overlap(ps,s)>=DUP){ dup=true; break; }
        if(dup) continue;
        ids.add(id); sets.push(ps); froms.add(lv.id);
        const nmark=(b.match(/[1-9]/g)||[]).length;
        out.push({id, b, p:r.p, nbox:nb, nmark,
                  floors:(b.match(/[ .$*@+~1-9a-i]/g)||[]).length,
                  from:lv.id, base:lv.p, match:r.match, cross:'必須'});
        out.sort((a,b2)=>a.p-b2.p);
        fs.mkdirSync(path.dirname(outFile), {recursive:true});
        fs.writeFileSync(outFile, JSON.stringify({rule:'marks', levels:out}, null, 1));
        const match=r.match===null ? '合わせ不能' : `合わせ${r.match}手`;
        console.log(`${out.length}面目 ${r.p}手(印なしなら${lv.p}手, ${match}) 荷物${nb}(印${nmark})`);
        got=true;
        break;
      }
    }
  }
  console.log(`\n${outFile} に ${out.length}面 (${tried}通り試した)`);
  return out;
}

const args=process.argv.slice(2);
if(args[0]==='--hunt'){
  const want=+(args[1]||8);
  const outFile=args[2]||path.join(__dirname,'stock','mark-cross-hunt.json');
  const pack=JSON.parse(fs.readFileSync(path.join(__dirname,'..','warehouse','packs','mark.json'),'utf8'));
  hunt(want, outFile, pack.levels);
}else{
  const file=args[0]||path.join(__dirname,'..','warehouse','packs','mark.json');
  const result=analyze(file);
  const stock=path.join(__dirname,'stock','mark-cross.json');
  fs.mkdirSync(path.dirname(stock), {recursive:true});
  fs.writeFileSync(stock, JSON.stringify(result, null, 1));
  console.log('控え: '+stock);
}

module.exports={classify, onePath, usesCross, isMatch};
