/* 倉庫パズルと、そのルール違いの本体。
   原本は warehouse/index.html。直したら node tools/split-game.js を回すこと。

   頁ごとの違いは、読み込む前に window.GAME に入れておく:
     pack  … ルール違いの名前(本編は null)
     asset … 絵や部品の置き場(本編は '' 、ルール違いは '../warehouse/')  */
'use strict';
document.body.insertAdjacentHTML("afterbegin", `<div class="app">
  <header>
    <a class="iconbtn" href="../">◀ メニュー</a>
    <h1>倉庫パズル</h1>
    <button class="iconbtn" id="btnRules" title="ルール">ルール</button>
  </header>

  <div class="banner" id="banner"><span id="bannerText"></span></div>

  <!-- デバッグ用のボタンはまとめてステージより上に置く -->
  <div class="debugbar">
    <button class="btn" id="btnUndo">↩ 戻す</button>
    <button class="btn" id="btnHint">💡 ヒント</button>
    <button class="btn" id="btnPick">選ぶ</button>
    <button class="btn" id="btnBadExport">★✕を書き出す</button>
    <button class="btn" id="btnBadWipe">★✕を消す</button>
    <button class="btn" id="btnCheck">解けるか確かめる</button>
    <button class="btn" id="btnEditReset">編集を戻す</button>
    <button class="btn" id="btnEditExport">書き出す</button>
    <button class="btn" id="btnPack">ルール版</button>
    <button class="btn" id="btnEffort">手こずり具合を書き出す</button>
    <button class="btn" id="btnWipe">記録を消す</button>
    <button class="btn" id="btnMark">ここまで進んだことにする</button>
    <button class="btn" id="btnFresh">最新に更新</button>
    <button class="btn" id="btnSoundTest">音を試す</button>
    <button class="btn" id="btnSkin">見た目</button>
    <button class="btn" id="btnPrev">◀</button>
    <button class="btn" id="btnNext">▶</button>
  </div>

  <div class="stagebar">
    <div class="pushes"><span id="pushes">0</span> 手</div>
    <div class="stagelabel" id="stageLabel">ステージ</div>
    <div class="stageno"><span id="stageNo">--</span></div>
    <button class="iconbtn reset" id="btnReset" title="このステージをやり直す">やり直し</button>
  </div>

  <div class="board-wrap">
    <div class="board" id="board" role="img" aria-label="倉庫パズルの盤面"></div>
    <div class="loading" id="loading"><div class="spin">📦</div><div id="loadingText">読み込み中…</div></div>
  </div>

  <div class="palette" id="palette">
    <button data-tool="wall">壁</button>
    <button data-tool="floor">床</button>
    <button data-tool="goal">置き場</button>
    <button data-tool="box">荷物</button>
    <button data-tool="man">🐥</button>
  </div>

  <div class="msg" id="msg"></div>
  <div class="boardnote" id="boardNote"></div>

  <div class="favpanel" id="favPanel">
    <div class="q" id="favQ">このステージ、どのあたり？</div>
    <div class="v"><span id="favVal">250</span> 面くらい</div>
    <input type="range" id="favRange" min="1" max="500" value="250">
    <div class="row">
      <button class="btn" id="favSkip">指定しない</button>
      <button class="btn" id="btnExport">書き出す</button>
    </div>
  </div>

  <div class="spacer"></div>

  <div class="bottomarea">
  <div class="dpad">
    <!-- 4つとも同じ ↑ を入れ、CSS で三角形ごと回して各方向を向かせる -->
    <button data-dir="up" aria-label="上へ">↑</button>
    <button data-dir="down" aria-label="下へ">↑</button>
    <button data-dir="left" aria-label="左へ">↑</button>
    <button data-dir="right" aria-label="右へ">↑</button>
  </div>

  <div class="footrow">
    <div class="left">
      <button class="btn" id="btnDpadMode" title="十字キーの表示">キー大</button>
    </div>
    <div class="mid"></div>
    <div class="right">
      <button class="btn" id="btnFav" style="display:none">★ --</button>
      <button class="btn" id="btnBad" style="display:none">✕</button>
      <button class="btn" id="btnHist"><i>📋</i>履歴</button>
      <button class="btn" id="btnCo"><i>🤝</i>協力</button>
      <button class="btn" id="btnCoSend">送り返す</button>
      <a class="btn" id="btnBackHome" href="?" style="display:none">本編へ</a>
    </div>
  </div>
  </div>
</div>

<div class="overlay" id="overlay">
  <div class="win-card">
    <div class="win-emoji">📦🎉🐥</div>
    <div class="win-title" id="winTitle">クリア！</div>
    <div class="win-verdict" id="winVerdict"></div>
    <div class="win-time" id="winPush">0手</div>
    <div class="win-sub" id="winSub"></div>
    <button class="btn" id="btnFavWin" style="display:none">★ --</button>
    <button class="btn" id="btnBadWin" style="display:none">✕ この面は良くない</button>
    <button class="btn" id="btnShare">📨 結果を送る</button>
    <button class="btn btn-new" id="btnNextStage">次のステージへ</button>
  </div>
</div>

<div class="overlay" id="rulesOverlay">
  <div class="win-card" style="text-align:left">
    <div style="font-size:17px;font-weight:800;text-align:center;margin-bottom:12px">ルール</div>
    <div class="rules">
      <p>🐥 を動かして、📦 をすべて<b>置き場</b>に運びます。</p>
      <p>置き場は<span class="sw goal"></span><b>オレンジのマス</b>です。荷物が乗ると<span class="sw done"></span><b>グリーン</b>に変わります。<b>全部グリーンになればクリア</b>です。</p>
      <p><b>箱は押すことしかできません。</b>引けません。一度に押せる箱は1つだけで、壁や別の箱が後ろにあると押せません。</p>
      <p>角に押し込むなど、二度と動かせない置き方をすると<b>その面は詰みます</b>。おかしいと思ったら右上の <b>やり直し</b> を押してください。</p>
      <p>操作は<b>十字キー</b>、または<b>画面のスワイプ</b>です。十字キーは左下のボタンで<b>キー大 / キー小 / キーなし</b>を切り替えられます。</p>
      <p>パソコンでは <b>矢印キー</b> か <b>WASD</b> でも動かせます。</p>
      <p>ステージは1面ずつ進みます。クリアすると、その面の<b>最短手数</b>が分かります。</p>
      <p>クリアした面は、右下の <b>履歴</b> から解き直せます。最短で解けるまで何度でも挑めます。</p>
    </div>
    <button class="btn btn-new" id="btnRulesClose" style="margin-top:14px">とじる</button>
  </div>
</div>

<div class="overlay" id="pickOverlay">
  <div class="picker">
    <h2>ステージを選ぶ（デバッグ）</h2>
    <div class="chapters" id="chapters"></div>
    <div class="grid-stages" id="stageGrid"></div>
    <button class="btn" id="btnPickClose">とじる</button>
  </div>
</div>

<div class="overlay" id="histOverlay">
  <div class="picker">
    <h2>クリア履歴</h2>
    <div class="histsum" id="histSum"></div>
    <div class="chapters" id="histChapters"></div>
    <div class="chapters histfilter"><button id="btnHistFilter">最短でない面だけ</button></div>
    <div class="histlist" id="histList"></div>
    <div class="chapters histmove"><button id="btnMoveOpen">📦 これまでの記録を引っ越し</button></div>
    <button class="btn btn-new" id="btnHistClose">とじる</button>
    <button class="btn" id="btnHistExit">本編にもどる</button>
  </div>
</div>

<div class="overlay" id="moveOverlay">
  <div class="picker">
    <h2>引っ越し</h2>

    <h3 class="movehead">ほかの端末に引っ越し</h3>
    <div class="movesum" id="moveSum"></div>
    <div class="movehint">下のリンクをコピーして、新しい端末で開いてください。<br>開いた端末に、これまでの記録が入ります。</div>
    <textarea class="movebox" id="moveUrl" readonly rows="4"></textarea>
    <div class="chapters"><button id="btnMoveCopy">リンクをコピー</button></div>

    <h3 class="movehead">引っ越しデータを入力</h3>
    <div class="movehint">前の端末でコピーしたものを貼り付け</div>
    <textarea class="movebox" id="movePasteBox" rows="3" placeholder="ここに貼り付けてください"></textarea>
    <div class="chapters"><button id="btnMovePaste">この端末に入れる</button></div>

    <button class="btn btn-new" id="btnMoveClose">とじる</button>
  </div>
</div>
`);
document.querySelector('header h1').textContent=document.title;
'use strict';

/* ================= 動作モード =================
   ふつうは進むだけ。戻る手段も、詰み表示もヒントも出さない。
     ?debug=1   … 戻す/ヒント/詰み表示/ステージ選択を出す
     ?mod=1     … モデレーション。面を行き来しながら、良くない面に×を付ける
     ?edit=1    … 面編集。マスを塗り替えて、解けるか確かめて書き出す
     ?lv=N      … 送られてきた1面だけを独立して遊ぶ(本編の進行に影響しない)
     ?history=1 … クリア履歴を開いた状態で始める(右下のボタンと同じ)
     ?skin=beetle   … フンコロガシ。🐥→🪲 📦→💩
     ?skin=squirrel … リスのどんぐり集め。🐥→🐿️ 📦→🌰
     ?skin=winter   … 冬。🐥→⛄ 📦→🧊
     ?skin=spring   … 春。🐥→🐝 📦→🌸
     ?skin=summer   … 夏。🐥→🦀 📦→🍉
     ?skin=normal   … ふつうに戻す (どれも端末に覚えさせる)
     ?co=…      … 協力プレイ。交互に荷物を1個ずつ動かして送り合う */
const QS=new URLSearchParams(location.search);
/* ルールを変えた着せ替え版。?pack=summer のように指定する。
   まだ試作なので、切り替えはデバッグ表示のときだけ出す。
   本編(levels.json)とは面も記録も完全に別扱いにする */
/* 絵や部品の置き場。本編は '' 、ルール違いの頁は '../warehouse/' */
const ASSET=(window.GAME&&window.GAME.asset)||'';
const PACKS={
  summer:  {file:'packs/summer.json',   skin:'summer',   label:'夏・水',  rule:'water',
            // 水に濡れて困るのはダンボール。すいかでは理屈が通らない
            box:'📦'},
  squirrel:{file:'packs/squirrel.json', skin:'squirrel', label:'リス・穴', rule:'holes'},
  ice:     {file:'packs/ice.json',      skin:'winter',   label:'冬・滑る氷', rule:'slide'},
};
const PACK=(()=>{
  // 頁が決めた値が最優先。本編の頁だけ ?pack= での試し読みを許す
  const g=(window.GAME&&window.GAME.pack)||null;
  if(g && PACKS[g]) return g;
  const q=QS.get('pack');
  return (q && PACKS[q]) ? q : null;
})();
const FILE = ASSET + (PACK ? PACKS[PACK].file : 'levels.json');
const RULE = PACK ? (PACKS[PACK].rule||'plain') : 'plain';

// クエリを付けられない場所(埋め込みプレビューなど)からも入れるよう、
// 「ステージ」の文字を5回つづけて叩いても切り替わるようにしてある
// ?debug=1 / ?debug=0 は、その場かぎりではなく端末に覚えさせる。
// URL には書き戻さないので、リンクを踏んだあとも URL は素のまま残る
if(QS.get('debug')==='1'||QS.get('debug')==='0'){
  try{ localStorage.setItem('warehouse-debug', QS.get('debug')); }catch(e){}
}
const debugSaved=(()=>{ try{ return localStorage.getItem('warehouse-debug')==='1'; }catch(e){ return false; } })();
// 見た目の着せ替え。絵と色を入れ替えるだけなので、どのモードとも重ねられる
const SKINS={
  normal:  {man:'🐥',  box:'📦', label:'ふつう',       title:'倉庫パズル',   icon:''},
  beetle:  {man:'🪲',  box:'💩', label:'フンコロガシ', title:'フンコロガシ', icon:'-beetle'},
  squirrel:{man:'🐿️', box:'🌰', label:'リス',         title:'どんぐり',     icon:'-squirrel'},
  winter:  {man:'⛄',  box:'🧊', label:'冬',           title:'ゆきだるま',   icon:'-winter'},
  spring:  {man:'🐝',  box:'🌸', label:'春',           title:'みつばち',     icon:'-spring'},
  summer:  {man:'🦀',  box:'🍉', label:'夏',           title:'すいかわり',   icon:'-summer'},
};
const SKIN_ORDER=['normal','beetle','squirrel','winter','spring','summer'];
(function(){
  // ?skin=… と、前からある ?beetle=1/0 の両方を受ける
  let want=QS.get('skin');
  if(!want && QS.get('beetle')==='1') want='beetle';
  if(!want && QS.get('beetle')==='0') want='normal';
  if(want && SKINS[want]){ try{ localStorage.setItem('warehouse-skin', want); }catch(e){} }
})();
const skinName=(()=>{
  if(PACK) return PACKS[PACK].skin;          // ルール版は見た目も固定
  const q=QS.get('skin');
  if(q && SKINS[q]) return q;
  if(QS.get('beetle')==='1') return 'beetle';
  if(QS.get('beetle')==='0') return 'normal';
  try{ const v=localStorage.getItem('warehouse-skin'); if(v&&SKINS[v]) return v; }catch(e){}
  // 以前のフンコロガシの保存値も見る
  try{ if(localStorage.getItem('warehouse-beetle')==='1') return 'beetle'; }catch(e){}
  return 'normal';
})();
const SKIN=Object.assign({}, SKINS[skinName],
  PACK ? {box:PACKS[PACK].box||SKINS[skinName].box, man:PACKS[PACK].man||SKINS[skinName].man} : {});
const MOD=QS.get('mod')==='1';
// モデレーションは素の状態で遊んで判断するもの。端末の記録も URL の指定も無視して、
// 戻す・ヒント・詰み表示は出さない
const DEBUG=!MOD && (QS.get('debug')==='1' || (QS.get('debug')!=='0' && debugSaved));
const EDIT=QS.get('edit')==='1';
// クリア履歴から選んだ面を解き直している最中。モードではなく、その場の状態。
// 開き直せば本編に戻るので、行き止まりにはならない
let replaying=false;
const WANT=+QS.get('lv')||0;
let SHARED=false;                        // 共有リンクで開いた1面モード
if(DEBUG) document.body.classList.add('debug');
if(MOD) document.body.classList.add('mod');
if(EDIT) document.body.classList.add('edit');
// ステージを行き来できるモード
const NAV = DEBUG || MOD || EDIT;

/* ================= 効果音 ================= */
const AC = window.AudioContext || window.webkitAudioContext;
let actx = null;
// iOS は「ユーザーが操作した」と認めた場面でしか音を鳴らさせてくれない。
// touchmove はその中に入っていないので、スワイプで動かすこのゲームでは
// move() の中で用意していては間に合わない。触れた瞬間に用意しておく。
// ホーム画面から起動したときは、触っても止まったままのことがある。
// iOS はアプリを離れて戻ると止まった状態に戻る(電話・Siri・裏に回るなど)。
// 一度開通したら終わり、にしてはいけない。触られるたびに状態を見て、
// 動いていなければ何度でも起こす
// 何が起きているか見えるようにする(デバッグ表示に出す)
const audioLog={touch:0, make:0, resume:0, ok:0, wav:0, err:'', ses:''};
/* 消音スイッチが入っているときは、黙るのが正しい。用途は宣言しない。
   代わりに、iOS で頑固に開かないときの定石を使う:
   指の中でまず <audio> を鳴らして音の道を開き、そのあとで WebAudio を起こす。
   逆順だと、標準の音の箱がずっと止まったままのことがある */
const SILENT='data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
let silentEl=null, mediaNo=0;
function pokeMedia(){
  if(mediaNo>=3) return;                       // 断られ続けるなら、もう叩かない
  try{
    if(!silentEl){ silentEl=new Audio(SILENT); silentEl.preload='auto'; }
    const p=silentEl.play();
    if(p&&p.then) p.then(()=>{ audioLog.ses='開'; mediaNo=0; })
                   .catch(e=>{ mediaNo++; audioLog.ses='×'+String(e&&e.name||'').slice(0,8); });
    else audioLog.ses='開?';
  }catch(e){ mediaNo++; audioLog.ses='×'; }
}
/* touched=true は「いま指(かキー)の中にいる」という意味。
   操作の外で箱を作ると、iOS はあとから動かしてくれないことがある。
   ホーム画面から起動したときに音が出ないのは、たいていこれ。
     ・箱を作るのは、必ず操作の中で、一度だけ
     ・同じ操作の中で無音を1つ鳴らす。これが開通の実体で、resume() だけでは足りない
     ・開かないまま粘らない。作り直しは、箱を8個も作って画面を固まらせた */
const AUDIO_TRIES=8;
let audioTries=0;
function ensureAudio(touched){
  if(!AC || !touched) return;                 // 操作の外では何もしない
  audioLog.touch++;
  try{
    if(!actx){
      if(audioTries>=AUDIO_TRIES) return;
      actx = new AC(); audioLog.make++;
    }
    if(actx.state === 'running'){
      audioLog.ok++;
      try{                                    // 開いているときだけ、無音で温める
        const b=actx.createBuffer(1,1,22050);
        const src=actx.createBufferSource();
        src.buffer=b; src.connect(actx.destination); src.start(0);
      }catch(e){}
      return;
    }
    if(audioTries>=AUDIO_TRIES) return;        // これ以上ねばらない。鳴らないなら黙る
    audioTries++;
    audioLog.resume++;
    pokeMedia();                               // 先に音の道を開く
    actx.resume().catch(e=>{ audioLog.err=String(e&&e.name||e).slice(0,12); });
  }catch(e){ audioLog.err=String(e&&e.name||e).slice(0,12); }
}
const audioTouch=()=>ensureAudio(true);
for(const ev of ['touchstart','touchend','pointerdown','click','keydown']){
  document.addEventListener(ev, audioTouch, {passive:true, capture:true});
}
// 戻ってきた直後は、すでにある箱を起こすだけ(新しく作らない・数えない)
const wakeAudio=()=>{ try{ if(actx && actx.state!=='running') actx.resume().catch(()=>{}); }catch(e){} };
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) wakeAudio(); });
window.addEventListener('pageshow', wakeAudio);
window.addEventListener('focus', wakeAudio);
function beep(freq, dur, delay, type, vol){
  // 止まっている間に鳴らそうとすると、時計が進まないので予約が同じ時刻に溜まる。
  // あとで動き出した瞬間、溜まったぶんが一斉に鳴る。鳴らせないときは捨てる
  if(!actx || actx.state !== 'running'){
    if(audioLog.touch) playWav(freq, dur, delay, type, vol);   // 触られているのに開かない端末むけ
    return;
  }
  const t = actx.currentTime + (delay||0);
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type || 'square';
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol||0.06, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + dur);
}
/* WebAudio がどうしても開かない端末がある(ホーム画面のアプリで起きやすい)。
   そのときは、同じ音を波形データにして <audio> で鳴らす。開通の作法が別なので通ることがある。
   8kHz・16bitの短い音なので、作るのも一瞬 */
function toneWav(freq, dur, type, vol){
  const sr=8000, n=Math.max(1,Math.floor(sr*dur)), bytes=44+n*2;
  const b=new Uint8Array(bytes), dv=new DataView(b.buffer);
  const put=(o,str)=>{ for(let i=0;i<str.length;i++) b[o+i]=str.charCodeAt(i); };
  put(0,'RIFF'); dv.setUint32(4, bytes-8, true); put(8,'WAVEfmt ');
  dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,1,true);
  dv.setUint32(24,sr,true); dv.setUint32(28,sr*2,true); dv.setUint16(32,2,true); dv.setUint16(34,16,true);
  put(36,'data'); dv.setUint32(40,n*2,true);
  for(let i=0;i<n;i++){
    const t=i/sr, env=Math.pow(0.001, t/dur);       // 減衰は WebAudio 側と同じ形
    const ph=(t*freq)%1;
    const w = type==='noise' ? (Math.random()*2-1)
            : type==='triangle' ? (4*Math.abs(ph-0.5)-1)
            : type==='sine' ? Math.sin(2*Math.PI*ph)
            : type==='sawtooth' ? (2*ph-1)
            : (ph<0.5?1:-1);
    dv.setInt16(44+i*2, Math.max(-1,Math.min(1, w*env*(vol||0.06)*3))*32767, true);
  }
  let str='';
  for(let i=0;i<bytes;i++) str+=String.fromCharCode(b[i]);
  return 'data:audio/wav;base64,'+btoa(str);
}
const WAV={};
function wavFor(freq,dur,type,vol){
  const k=freq+'_'+dur+'_'+type+'_'+vol;
  if(!WAV[k]){ const a=new Audio(toneWav(freq,dur,type,vol)); a.preload='auto'; WAV[k]=a; }
  return WAV[k];
}
let wavNo=0;
function playWav(freq,dur,delay,type,vol){
  if(wavNo>=3) return;                         // 断られ続けるなら、もう鳴らそうとしない
  const go=()=>{ try{
    const a=wavFor(freq,dur,type,vol); a.currentTime=0;
    const p=a.play();
    if(p&&p.catch) p.catch(e=>{ wavNo++; audioLog.err='波:'+String(e&&e.name||e).slice(0,10); });
    audioLog.wav++;
  }catch(e){ audioLog.err='波:'+String(e&&e.name||e).slice(0,10); } };
  if(delay) setTimeout(go, delay*1000); else go();
}
/* ざらっとした音(シューッ、ザッ、カサカサ)。音程ではなく雑音を作って、
   通す帯を動かして色をつける。滑る音・足音・葉ずれは、これでないと出せない */
let noiseBuf=null, smoothBuf=null;
/* 粒の粗い雑音は「砂」に聞こえる。値を数サンプルおきに作って間をつなぐと、
   粒が滑らかになり、氷や風のような音に寄る */
function makeNoise(smooth){
  const n=Math.floor(actx.sampleRate*0.7);
  const buf=actx.createBuffer(1,n,actx.sampleRate);
  const d=buf.getChannelData(0);
  if(!smooth){ for(let i=0;i<n;i++) d[i]=Math.random()*2-1; return buf; }
  const step=3;                                  // 3サンプルに1回だけ値を決めて、間は直線でつなぐ
  let prev=Math.random()*2-1, next=Math.random()*2-1;
  for(let i=0;i<n;i++){
    const k=i%step;
    if(k===0){ prev=next; next=Math.random()*2-1; }
    d[i]=prev+(next-prev)*(k/step);
  }
  return buf;
}
function noise(dur, delay, opt){
  opt=opt||{};
  if(!actx || actx.state!=='running'){
    if(audioLog.touch) playWav(0, dur, delay, 'noise', opt.vol);
    return;
  }
  try{
    if(opt.smooth){ if(!smoothBuf) smoothBuf=makeNoise(true); }
    else if(!noiseBuf) noiseBuf=makeNoise(false);
    const t=actx.currentTime+(delay||0);
    const src=actx.createBufferSource();
    src.buffer=opt.smooth?smoothBuf:noiseBuf; src.loop=true;
    const f=actx.createBiquadFilter();
    f.type=opt.type||'bandpass';
    f.frequency.setValueAtTime(opt.from||1500, t);
    if(opt.to) f.frequency.exponentialRampToValueAtTime(opt.to, t+dur);
    f.Q.value=opt.q||1;
    const g=actx.createGain();
    const vol=opt.vol||0.04;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t+Math.min(0.02,dur*0.3));
    // hold を指定すると、そこまでは同じ大きさで鳴り、残りで小さくなって終わる
    if(opt.hold) g.gain.setValueAtTime(vol, t+dur*opt.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    src.connect(f).connect(g).connect(actx.destination);
    src.start(t); src.stop(t+dur+0.02);
  }catch(e){}
}
/* 続けて鳴らすと、切れずにつながる音。
   一歩ごとに音を作ると、速く歩いたとき「ブンブンブン」と刻まれてしまう。
   鳴りっぱなしの音をひとつ持っておいて、一歩ごとに寿命を延ばすだけにすると、
   間が空かないかぎり「ブーーーん」と一本に聞こえる。
   最後の一歩から tail 秒たつと、細くなって黙る */
let buzz=null;
function buzzOn(freqs, vol, tail){
  if(!actx || actx.state!=='running'){
    if(audioLog.touch) playWav(freqs[0], tail, 0, 'sawtooth', vol);
    return;
  }
  try{
    if(!buzz || buzz.ctx!==actx){
      const g=actx.createGain();
      g.gain.value=0.0001;
      g.connect(actx.destination);
      // わずかにずらした音を重ねて唸らせる。作るのは最初の一度だけ
      const os=freqs.map(f=>{
        const o=actx.createOscillator();
        o.type='sawtooth'; o.frequency.value=f;
        o.connect(g); o.start();
        return o;
      });
      buzz={ctx:actx, g, os};
    }
    const t=actx.currentTime, p=buzz.g.gain;
    // いま出ている大きさから続ける。切って作り直さないので、継ぎ目が鳴らない
    p.cancelScheduledValues(t);
    p.setValueAtTime(Math.max(p.value, 0.0001), t);
    p.exponentialRampToValueAtTime(vol, t+0.015);
    p.setValueAtTime(vol, t+tail*0.5);
    p.exponentialRampToValueAtTime(0.0001, t+tail);
  }catch(e){}
}

/* 着せ替えごとの音。
   ふつう(ヒヨコ)は元のまま。
   冬 … 滑るシューッ、雪を踏むザッザッ、氷が収まるシャリーン
   フンコロガシ … 転がすゴロゴロ、砂を掻くカサッ、収まるとポフッ
   リス … 木の実のコロン、落ち葉のカサカサ、収まると木琴のコロン */
const SFX_SETS={
  normal:{
    step(){ beep(520, 0.04, 0, 'square', 0.025); },
    push(){ beep(300, 0.07, 0, 'square', 0.05); },
    blocked(){ beep(150, 0.1, 0, 'square', 0.05); },
    onGoal(){ beep(784, 0.08, 0, 'square', 0.06); beep(1046.5, 0.12, 0.07, 'square', 0.06); },
    undo(){ beep(400, 0.06, 0, 'triangle', 0.05); beep(300, 0.08, 0.05, 'triangle', 0.05); },
    dead(){ beep(196, 0.12, 0, 'square', 0.05); beep(155, 0.22, 0.1, 'square', 0.05); },
    win(){ [523.25,659.25,783.99,1046.5,1318.51].forEach((f,i)=>beep(f, i===4?0.34:0.13, i*0.11, 'square', 0.07)); },
  },
  winter:{
    // ザッ。雪を踏む音。控えめに
    step(){ noise(0.06, 0, {from:1400, to:700, q:0.8, vol:0.022}); },
    // シューッ。粒を滑らかにした雑音を、狭めの帯(q=5)で鳴らす。
    // 粗い雑音のままだと砂を擦る音になり、帯を狭くしすぎると笛になる。その中間。
    // 帯は動かさない(動かすと終わりで音程が下がって聞こえる)。
    // 代わりに、音量だけを落として終わる。消え際を長く取りたいので、
    // 前3.5割だけ同じ大きさで鳴らし、残り6.5割(0.33秒)かけて細くしていく
    push(){ noise(0.5, 0, {type:'bandpass', from:3400, q:5, vol:0.04, hold:0.35, smooth:true}); },
    blocked(){ noise(0.1, 0, {from:400, to:180, q:1.2, vol:0.05}); },
    // シャリーン。高い音を少しずらして重ねる
    onGoal(){
      beep(1567.98, 0.5, 0,    'sine', 0.05);
      beep(2093,    0.45, 0.03,'sine', 0.035);
      beep(3135.96, 0.3, 0.06, 'sine', 0.02);
      noise(0.25, 0, {from:6000, to:3000, q:2, vol:0.015});
    },
    undo(){ beep(600, 0.08, 0, 'sine', 0.04); beep(450, 0.1, 0.06, 'sine', 0.04); },
    dead(){ beep(220, 0.14, 0, 'sine', 0.05); beep(165, 0.26, 0.12, 'sine', 0.05); },
    win(){ [1046.5,1318.51,1567.98,2093].forEach((f,i)=>beep(f, i===3?0.6:0.2, i*0.12, 'sine', 0.05)); },
  },
  beetle:{
    // カサッ。砂を掻く
    step(){ noise(0.05, 0, {from:700, to:400, q:1, vol:0.02}); },
    // ゴロゴロ。重い塊を転がす
    push(){
      beep(70, 0.22, 0, 'sawtooth', 0.05);
      noise(0.22, 0, {type:'lowpass', from:320, to:160, vol:0.04});
    },
    blocked(){ beep(90, 0.13, 0, 'square', 0.055); },
    // ポフッ。乾いた土に収まる
    onGoal(){
      beep(196, 0.12, 0, 'sine', 0.06);
      beep(147, 0.18, 0.05, 'sine', 0.05);
      noise(0.12, 0, {type:'lowpass', from:500, to:200, vol:0.03});
    },
    undo(){ beep(160, 0.09, 0, 'sawtooth', 0.045); beep(120, 0.12, 0.06, 'sawtooth', 0.045); },
    dead(){ beep(110, 0.16, 0, 'sawtooth', 0.05); beep(82, 0.3, 0.13, 'sawtooth', 0.05); },
    win(){ [130.8,164.8,196,261.6,392].forEach((f,i)=>beep(f, i===4?0.4:0.15, i*0.12, 'sawtooth', 0.05)); },
  },
  spring:{
    // 移動も羽音。押すときのブンより、音程をかなり下げて、音量も少し下げる。
    step(){ buzzOn([104,108], 0.018, 0.07); },
    // 花を押す音。移動が羽音になったので、こちらからは羽音の成分を抜く。
    // 唸り(2つをずらして重ねる)が「ブン」の正体なので、重ねるのをやめて1つに。
    // 波形もノコギリ(ざらつく)から三角(やわらかい)にして、ポンと鳴るだけにする
    // 音量を上げても小さく聞こえるのは、190Hz が携帯の小さなスピーカーだと
    // ほとんど出ないため。音量を上げたうえで、1オクターブ上を薄く重ねて
    // スピーカーが鳴らせる高さを足す。倍の高さなので唸らず、ブンには戻らない
    push(){
      beep(190, 0.12, 0, 'triangle', 0.30);
      beep(380, 0.10, 0, 'triangle', 0.10);
    },
    blocked(){ beep(120, 0.11, 0, 'sawtooth', 0.05); },
    // 花が咲くようなポワン
    onGoal(){ beep(880, 0.14, 0, 'sine', 0.055); beep(1318.51, 0.24, 0.06, 'sine', 0.05); },
    undo(){ beep(494, 0.07, 0, 'sine', 0.04); beep(370, 0.1, 0.05, 'sine', 0.04); },
    dead(){ beep(233, 0.13, 0, 'sawtooth', 0.05); beep(175, 0.26, 0.11, 'sawtooth', 0.05); },
    win(){ [587.33,739.99,880,1174.66,1318.51].forEach((f,i)=>beep(f, i===4?0.4:0.14, i*0.1, 'sine', 0.06)); },
  },
  summer:{
    // サクッ。濡れた砂を踏む音。冬の雪より高くて短い
    step(){ noise(0.05, 0, {from:3200, to:1600, q:1.2, vol:0.02}); },
    // ゴロン。すいかが転がる。低い胴と、砂を擦る音を重ねる。
    // 春と同じ理由で、携帯でも出るように1オクターブ上を薄く足す
    push(){
      beep(150, 0.16, 0, 'triangle', 0.26);
      beep(300, 0.12, 0, 'triangle', 0.09);
      noise(0.18, 0, {from:1000, to:400, q:1.4, vol:0.03});
    },
    blocked(){ beep(105, 0.11, 0, 'triangle', 0.09); },
    // チリーン。風鈴。冬のシャリーンより音が少なく、余韻が長い
    onGoal(){
      beep(2093,    0.55, 0,    'sine', 0.05);
      beep(2637.02, 0.45, 0.04, 'sine', 0.03);
    },
    undo(){ beep(523.25, 0.07, 0, 'sine', 0.04); beep(392, 0.1, 0.05, 'sine', 0.04); },
    dead(){ beep(196, 0.13, 0, 'triangle', 0.06); beep(147, 0.26, 0.11, 'triangle', 0.06); },
    // 夏祭りの囃子ふうに、都節でなく明るい五音で上がる
    win(){ [523.25,587.33,698.46,783.99,1046.5].forEach((f,i)=>beep(f, i===4?0.4:0.13, i*0.1, 'sine', 0.06)); },
  },
  squirrel:{
    // 落ち葉を踏むカサカサ
    step(){ noise(0.05, 0, {from:3000, to:1600, q:0.9, vol:0.018}); },
    // コロン。木の実が転がる木の音
    push(){ beep(190, 0.1, 0, 'triangle', 0.05); noise(0.05, 0, {from:1800, q:2, vol:0.02}); },
    blocked(){ beep(140, 0.11, 0, 'triangle', 0.05); },
    // 木琴のコロン。巣穴に納まる
    onGoal(){ beep(1046.5, 0.16, 0, 'triangle', 0.06); beep(1396.9, 0.22, 0.06, 'triangle', 0.05); },
    undo(){ beep(392, 0.07, 0, 'triangle', 0.045); beep(294, 0.1, 0.05, 'triangle', 0.045); },
    dead(){ beep(196, 0.13, 0, 'triangle', 0.05); beep(147, 0.24, 0.11, 'triangle', 0.05); },
    win(){ [523.25,698.46,880,1174.66,1396.9].forEach((f,i)=>beep(f, i===4?0.36:0.14, i*0.1, 'triangle', 0.06)); },
  },
};
const SFX = SFX_SETS[skinName] || SFX_SETS.normal;

async function shareLink(url, text){
  if(navigator.share){
    try{ await navigator.share({text, url}); return; }catch(e){ if(e.name==='AbortError') return; }
  }
  try{ await navigator.clipboard.writeText(text+'\n'+url); alert('リンクをコピーしました！'); }
  catch(e){ prompt('このリンクをコピーして送ってね', url); }
}

/* ================= 盤面テキスト(XSB) ================= */
function parseBoard(board){
  const rows=board.split('/');
  const h=rows.length, w=Math.max.apply(null, rows.map(r=>r.length));
  const grid=new Uint8Array(w*h).fill(1);
  const water=new Uint8Array(w*h);
  const boxes=[], goals=[];
  let player=-1;
  for(let y=0;y<h;y++){
    const row=rows[y].padEnd(w,'#');
    for(let x=0;x<w;x++){
      const c=row[x], i=y*w+x;
      if(c==='#') continue;
      grid[i]=0;
      if(c==='~'){ water[i]=1; continue; }   // 夏。自機は通れるが荷物は通れない
      if(c==='$'||c==='*') boxes.push(i);
      if(c==='.'||c==='*'||c==='+') goals.push(i);
      if(c==='@'||c==='+') player=i;
    }
  }
  return {grid, water, w, h, boxes:boxes.sort((a,b)=>a-b), goals:goals.sort((a,b)=>a-b), player};
}

/* ================= 保存 ================= */
const store={
  get(k){ try{ return localStorage.getItem('warehouse-'+k); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem('warehouse-'+k,v); }catch(e){} }
};
const PKEY = PACK ? ('progress-'+PACK) : 'progress';
let progress={v:1, cleared:{}};
(function(){
  try{ const raw=store.get(PKEY); if(raw){ const o=JSON.parse(raw); if(o&&o.cleared) progress=o; } }catch(e){}
})();
const saveProgress=()=>store.set(PKEY, JSON.stringify(progress));
const isCleared=lv=>lv && progress.cleared[lv.id]!==undefined;
const bestOf=lv=>lv&&progress.cleared[lv.id];
// 「ここまで進んだことにする」で入れた仮の記録。実際に解いた手数ではない
const NOREC=999;

/* ================= 引っ越し =================
   別の端末へ、クリア記録をまるごと持っていくための仕組み。
   記録は端末の中にしか無いので、持ち出す道が要る。

   並び順ではなく「IDを並べ替えた順」を土台にする。面を並べ替えても
   引っ越しデータは壊れない(IDは面が生まれたときから変わらない)。

   中身:
     0         … 形式の版
     1-2       … 送り主が知っていた面の数
     3-6       … 面ぞろえの指紋(ずれた端末どうしを弾く)
     7         … 下3ビット=着せ替え / 次の2ビット=十字キーの大きさ
     8-        … クリアしたかどうかの旗を1面1ビット
     そのあと  … クリアした面ぶんだけ、最短からの超過を6ビット
                 (62でうちどめ。63は「ここまで進んだことにする」の仮記録)
     そのあと  … 手こずりの記録があるかの旗を、クリアした面1つにつき1ビット
     そのあと  … 記録がある面ぶんだけ、下の形で

         印(2ビット) + 初回に解けた押し数(6ビット、最短との差)
         印≧1 なら + それまでのやり直し回数(4ビット)
         印≧2 なら + その後、最短に届くまでの失敗回数(4) とやり直し回数(4)

   後ろの項目ほど「無いことが多い」ので、無ければ書かずに印で示す。
   最初から最短で解けた面は印0で、6ビット+2ビットしか使わない。

   手数を「最短からの超過」にするのは、生の値より小さくて詰められるから。
   1000面ぜんぶクリアで883バイト、base64で1178文字。手こずりの記録が
   全面に付くと、その上に1面あたり8〜16ビットが乗る */
const SPELL_VER=2;
const SPELL_MAX=62;                        // 超過はここでうちどめ
const SPELL_NOREC=63;                      // 仮記録の印

function canonIds(){ return LEVELS.map(l=>l.id).slice().sort(); }
// 面ぞろえの指紋。FNV-1a を32ビットで
function levelsFingerprint(ids){
  let h=0x811c9dc5;
  for(const id of ids){
    for(let i=0;i<id.length;i++){ h^=id.charCodeAt(i); h=Math.imul(h,0x01000193)>>>0; }
  }
  return h>>>0;
}
const b64url=bytes=>{
  let s='';
  for(let i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const unb64url=str=>{
  const s=str.replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(s+'==='.slice(0,(4-s.length%4)%4));
  const out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
  return out;
};

/* ビットを詰めて書く / 読む。可変長の項目を並べるので、
   バイト境界を気にせず書けるようにしておく */
function BitOut(){
  const bytes=[]; let cur=0, used=0;
  return {
    put(v, n){                                  // 下位nビットを書く
      for(let i=0;i<n;i++){
        cur |= ((v>>i)&1)<<used;
        if(++used===8){ bytes.push(cur); cur=0; used=0; }
      }
    },
    done(){ if(used) bytes.push(cur); return Uint8Array.from(bytes); }
  };
}
function BitIn(bytes){
  let at=0;
  return {
    get(n){                                     // nビット読む。足りなければ null
      if(at+n > bytes.length*8) return null;
      let v=0;
      for(let i=0;i<n;i++){
        v |= ((bytes[(at>>3)] >> (at&7)) & 1) << i;
        at++;
      }
      return v;
    },
    left(){ return bytes.length*8 - at; }
  };
}
const cap=(v,max)=>Math.max(0, Math.min(max, v|0));

function makeSpell(){
  const ids=canonIds(), n=ids.length;
  const byId={};
  LEVELS.forEach(l=>{ byId[l.id]=l; });

  const w=BitOut();
  // クリアしたかどうかの旗
  const done=[];
  ids.forEach(id=>{
    const has=progress.cleared[id]!==undefined;
    w.put(has?1:0, 1);
    if(has) done.push(id);
  });
  // クリアした面の、最短からの超過
  done.forEach(id=>{
    const best=progress.cleared[id];
    w.put(best===NOREC ? SPELL_NOREC : cap(best-(byId[id].p||0), SPELL_MAX), 6);
  });
  // 手こずり具合。クリアした面のうち、記録がある面だけ
  const withE=[];
  done.forEach(id=>{
    const has=!!efforts[id];
    w.put(has?1:0, 1);
    if(has) withE.push(id);
  });
  withE.forEach(id=>{
    const e=efforts[id], p=byId[id].p||0;
    const first=cap(e.f-p, SPELL_MAX);              // 初回に解けた押し数(最短との差)
    const r =cap(e.r, 15);                          // それまでのやり直し
    const f2=cap(e.f2, 15);                         // その後、最短に届くまでの失敗
    const r2=cap(e.r2, 15);                         //   〃      やり直し
    // 後ろから順に、無いものは書かない
    const tag = (f2||r2) ? 2 : (r ? 1 : 0);
    w.put(tag, 2);
    w.put(first, 6);
    if(tag>=1) w.put(r, 4);
    if(tag>=2){ w.put(f2, 4); w.put(r2, 4); }
  });
  const body=w.done();

  const fp=levelsFingerprint(ids);
  const out=new Uint8Array(8+body.length);
  out[0]=SPELL_VER;
  out[1]=n&0xFF; out[2]=(n>>8)&0xFF;
  out[3]=fp&0xFF; out[4]=(fp>>8)&0xFF; out[5]=(fp>>16)&0xFF; out[6]=(fp>>>24)&0xFF;
  // 着せ替えと十字キーを1バイトに同居させる
  out[7]=(Math.max(0, SKIN_ORDER.indexOf(skinName)) & 7)
       | ((Math.max(0, DPAD_MODES.indexOf(dpadMode)) & 3) << 3);
  out.set(body, 8);
  return b64url(out);
}

/* 引っ越しデータを読む。読めなければ理由を返す */
function readSpell(str){
  let b;
  try{ b=unb64url(String(str||'').trim()); }catch(e){ return {err:'引っ越しデータとして読めませんでした。コピーし損ねていないか確かめてください'}; }
  if(b.length<8) return {err:'引っ越しデータが足りません。全部コピーできているか確かめてください'};
  if(b[0]!==SPELL_VER) return {err:'この引っ越しデータは、いまより新しい形式です。この端末を最新にしてから、もう一度お試しください'};
  const n=b[1]|(b[2]<<8);
  const fp=(b[3]|(b[4]<<8)|(b[5]<<16)|(b[6]<<24))>>>0;
  const ids=canonIds();
  if(n!==ids.length || fp!==levelsFingerprint(ids))
    return {err:'ふたつの端末で、面の内容が違います。\nどちらも最新にしてから、もう一度お試しください。\n(タイトルの「倉庫パズル」を5回たたくと最新になります)'};
  const byId={};
  LEVELS.forEach(l=>{ byId[l.id]=l; });

  const r=BitIn(b.subarray(8));
  const cut={err:'引っ越しデータが途中で切れています。全部コピーできているか確かめてください'};
  const done=[];
  for(let i=0;i<n;i++){
    const v=r.get(1);
    if(v===null) return cut;
    if(v) done.push(ids[i]);
  }
  const cleared={};
  for(const id of done){
    const v=r.get(6);
    if(v===null) return cut;
    cleared[id] = v===SPELL_NOREC ? NOREC : (byId[id].p||0)+v;
  }
  const withE=[];
  for(const id of done){
    const v=r.get(1);
    if(v===null) return cut;
    if(v) withE.push(id);
  }
  const eff={};
  for(const id of withE){
    const tag=r.get(2), first=r.get(6);
    if(tag===null||first===null) return cut;
    const e={f:(byId[id].p||0)+first};
    if(tag>=1){ const v=r.get(4); if(v===null) return cut; e.r=v; }
    if(tag>=2){
      const a=r.get(4), c=r.get(4);
      if(a===null||c===null) return cut;
      e.f2=a; e.r2=c;
    }
    eff[id]=e;
  }
  return {cleared, efforts:eff, count:done.length,
          skin:SKIN_ORDER[b[7]&7]||'normal',
          dpad:DPAD_MODES[(b[7]>>3)&3]||null};
}

/* 取り込む。いまの記録は消さず、良いほうを残す */
function applySpell(res){
  let added=0, better=0, same=0;
  for(const id of Object.keys(res.cleared)){
    const inc=res.cleared[id], cur=progress.cleared[id];
    if(cur===undefined){ progress.cleared[id]=inc; added++; continue; }
    // 手数は少ないほうが良い。仮記録(NOREC)は本物に負ける
    if(inc<cur){ progress.cleared[id]=inc; better++; }
    else same++;
  }
  saveProgress();

  /* 手こずり具合は、こちらに無い面だけ入れる。
     すでにある面は上書きしない。手元の記録のほうが、
     その端末で実際に起きたことなので確か */
  let eAdded=0;
  for(const id of Object.keys(res.efforts||{})){
    if(efforts[id]) continue;
    efforts[id]=res.efforts[id];
    eAdded++;
  }
  if(eAdded) saveEfforts();

  return {added, better, same, eAdded};
}

/* ================= 手こずり具合の記録 =================
   面の並べ替えに使う「難易度」の実測値。いままで手数(最短押し回数)しか
   材料がなく、それは難しさそのものではなかった。実際に解いた人がどれだけ
   手こずったかを控える。

   二段構えで見る。
   初回に解けるまで … f(そのとき使った押し回数) r(やり直した回数)
                       u(戻した回数) s(かかった秒数)
   そのあと最短に届くまで … f2(最短に届かなかったクリアの回数)
                            r2(その間にやり直した回数)

   初回のぶんは一度書いたら上書きしない。答えを知る前の記録だけが、
   その面の難しさの証拠になるから。
   f2/r2 は最短に届いた時点で止める。届いてしまえば、それ以上は測りようがない。
   最初から最短で解けた面には f2/r2 が付かない(この場合は無い、が正しい)。

   progress とは別の鍵にして、進捗の記録を汚さない */
const EKEY = PACK ? ('effort-'+PACK) : 'effort';
let efforts={};
(function(){ try{ const raw=store.get(EKEY); if(raw) efforts=JSON.parse(raw)||{}; }catch(e){} })();
const saveEfforts=()=>{ try{ store.set(EKEY, JSON.stringify(efforts)); }catch(e){} };
let effort={id:null, u:0, r:0, s:0, at:0};
function effortStart(lv){
  effort={id:lv?lv.id:null, u:0, r:0, s:0, at:Date.now()};
}
function effortTick(){                       // 一手ごとに、経過を足していく
  if(!effort.id) return;
  const now=Date.now();
  effort.s += Math.min(30, Math.max(0, (now-effort.at)/1000));   // 離席は30秒で頭打ち
  effort.at=now;
}
function effortDone(lv, pushes){
  if(!effort.id || !lv || effort.id!==lv.id) return;
  const best=pushes===lv.p;                  // 最短で解けたか
  const e=efforts[lv.id];
  if(!e){                                    // 初回
    effortTick();
    efforts[lv.id]={f:pushes, u:effort.u, r:effort.r, s:Math.round(effort.s)};
    if(!best){ efforts[lv.id].f2=0; efforts[lv.id].r2=0; }   // ここから最短を目指す
    saveEfforts();
    return;
  }
  if(e.f2===undefined || e.reached) return;  // 最初から最短だった / もう届いた
  e.r2=(e.r2||0)+effort.r;                   // 届くまでのやり直しは、届いた回のぶんも数える
  if(best) e.reached=1;                      // 届いた。ここで数え終わり
  else e.f2=(e.f2||0)+1;                     // 最短でないクリアは、1回の失敗
  saveEfforts();
}
const isPerfect=lv=>isCleared(lv) && bestOf(lv)===lv.p;

// ★✕を付けた時点の並び。並べ替えるたびに変わるので、古い印と見分けがつく
let REV='normal';
// ★ 採用候補。1〜500でいうとどのあたりか、も一緒に覚える
let favs={}, favFromWin=false;
// モデレーションで付けた「良くない面」
let bads={};
(function(){ try{ bads=JSON.parse(store.get('bads')||'{}')||{}; }catch(e){ bads={}; } })();
const saveBads=()=>store.set('bads', JSON.stringify(bads));
function updateBadButton(){
  if(!puzzle) return;
  const on=!!bads[puzzle.meta.id];
  for(const id of ['btnBad','btnBadWin']){
    const b=$(id);
    b.classList.toggle('on', on);
    b.title = on ? '×を外す' : 'この面は良くないと記録する';
  }
  $('btnBadWin').textContent = on ? '✕ 良くないと記録した' : '✕ この面は良くない';
}
function toggleBad(){
  if(!puzzle) return;
  const lv=puzzle.meta;
  if(bads[lv.id]){ delete bads[lv.id]; }
  else bads[lv.id]={b:lv.b, at:index+1, orig:lv.orig||null, rev:REV,
                    p:lv.p, tr:lv.tr, f:lv.f, g:lv.g, og:lv.og, sh:lv.sh||''};
  saveBads(); updateBadButton();
}
// 集めた★と×を1つのファイルに落とす。
// 印は消さずに残るので、並べ替えをまたぐと古い印が混ざる。
// 付けた時点の並び(rev)を覚えておいて、いまの並びの分だけ書き出す。
// rev を持たない古い印でも、付けた時の面番号にいま同じ面が居るなら今の並びのもの。
// (並べ替えると面番号はずれるので、一致するのは今の並びで付けた印だけ)
function markedNow(id, at, rev){
  if(rev===REV) return true;
  if(rev!==undefined) return false;
  return !!(at>=1 && LEVELS[at-1] && LEVELS[at-1].id===id);
}
const favAt=f=>{ if(f.at) return f.at; const m=/第(\d+)面/.exec(f.from||''); return m?+m[1]:null; };
function exportBads(){
  const byId={}; let stale=0;
  for(const id of Object.keys(bads)){
    const v=bads[id];
    if(!markedNow(id, v.at, v.rev)){ stale++; continue; }
    byId[id]=Object.assign({id, verdict:'bad'}, v);
  }
  for(const id of Object.keys(favs)){
    const f=favs[id], at=favAt(f);
    if(!markedNow(id, at, f.rev)){ stale++; continue; }
    const lv=LEVELS.find(l=>l.id===id);
    byId[id]=Object.assign({id, verdict:'good', b:f.b, at, orig:lv?(lv.orig==null?null:lv.orig):null, rev:f.rev||REV},
                           lv?{p:lv.p,tr:lv.tr,f:lv.f,g:lv.g,og:lv.og,sh:lv.sh||''}:{});
  }
  const list=Object.values(byId).sort((a,b)=>(a.at||0)-(b.at||0));
  if(!list.length){
    alert(stale ? 'いまの並びで付けた ★ ✕ はありません。\n(前の並びの印が '+stale+'件 残っています)'
                : 'まだ ★ も ✕ も付いていません。');
    return;
  }
  const good=list.filter(x=>x.verdict==='good').length;
  const url=URL.createObjectURL(new Blob([JSON.stringify(list,null,1)], {type:'application/json'}));
  const a=document.createElement('a');
  a.href=url; a.download='moderation.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
  showMsg('★ '+good+'面 / ✕ '+(list.length-good)+'面 を moderation.json に書き出しました。'
    +(stale?'(前の並びの印 '+stale+'件は除きました)':''));
}
/* 手こずり具合を書き出す。面の並べ替えの材料にする。
   いまの並びでの面番号と、記録してある最短手数も一緒に出す */
function exportEfforts(){
  const list=[];
  for(const id of Object.keys(efforts)){
    const i=LEVELS.findIndex(l=>l.id===id);
    if(i<0) continue;                                  // もう無い面は捨てる
    const lv=LEVELS[i], e=efforts[id];
    if(e.f===NOREC) continue;                          // 「進んだことにする」の仮の記録
    list.push({at:i+1, id, p:lv.p, nbox:lv.nbox, floors:lv.floors, mano:lv.mano,
               first:e.f, over:e.f-lv.p, undo:e.u, reset:e.r, sec:e.s});
  }
  if(!list.length){ alert('まだ手こずり具合の記録がありません。\n(この記録を足したあとに初めて解いた面から貯まります)'); return; }
  list.sort((a,b)=>a.at-b.at);
  const url=URL.createObjectURL(new Blob([JSON.stringify(list,null,1)], {type:'application/json'}));
  const a=document.createElement('a');
  a.href=url; a.download='effort.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
  showMsg(list.length+'面ぶんを effort.json に書き出しました。');
}
// ★✕の記録だけを消す。並べ替えたあと、まっさらから付け直したいとき用
function wipeMarks(){
  const n=Object.keys(bads).length+Object.keys(favs).length;
  if(!n){ alert('消す ★ ✕ はありません。'); return; }
  if(!confirm('★ と ✕ の記録 '+n+'件をすべて消します。よろしいですか？')) return;
  bads={}; favs={}; saveBads(); saveFavs();
  updateBadButton(); updateFavButton();
  showMsg('★✕の記録を消しました。');
}
function setFavRange(max){
  const r=$('favRange');
  if(!(max>0)||+r.max===max) return;
  r.max=max;
  if(+r.value>max){ r.value=max; $('favVal').textContent=max; }
  $('favQ').textContent='このステージ、1〜'+max+'でいうとどのあたり？';
}
(function(){ try{ favs=JSON.parse(store.get('favs')||'{}')||{}; }catch(e){ favs={}; } })();
const saveFavs=()=>store.set('favs', JSON.stringify(favs));

/* ================= ゲーム状態 ================= */
const $=id=>document.getElementById(id);
const boardEl=$('board');

let LEVELS=[];
let index=0;
let puzzle=null, dist=null;
let boxes=[], player=0, goalSet=new Set();
let undoStack=[], pushCount=0, moveCount=0;
let filled=new Set();      // リス: 埋まった穴
let finished=false, deadShown=false;

/* 進んだところ。頭から数えて、まだクリアしていない一番手前の面。

   以前は「一番奥までクリアした面の次」にしていた。面を差し込んだときに
   前へ戻されるのを嫌ったため。だがこの数え方だと、並べ替えでクリア済みの面が
   後ろへ動いた瞬間、その手前がまるごと飛ばされる。
   実際に、クリア済みの1面が第403面から第426面へ動いたせいで、
   第404面から第425面までが二度と出てこなくなった。
   飛ばされるほうが害が大きいので、手前から埋める形にする */
function unlockedMax(){
  for(let i=0;i<LEVELS.length;i++) if(!isCleared(LEVELS[i])) return i;
  return Math.max(0, LEVELS.length-1);
}
const clearedCount=()=>Object.keys(progress.cleared).length;

/* ================= 十字キーの表示(大/小/なし) ================= */
const DPAD_MODES=['full','mini','off'];
const DPAD_LABEL={full:'キー大', mini:'キー小', off:'キーなし：スワイプで移動'};
let dpadMode=store.get('dpad')||'full';
if(DPAD_MODES.indexOf(dpadMode)<0) dpadMode='full';
function applyDpadMode(){
  document.body.classList.remove('dpad-mini','dpad-off');
  if(dpadMode==='mini') document.body.classList.add('dpad-mini');
  if(dpadMode==='off')  document.body.classList.add('dpad-off');
  $('btnDpadMode').textContent=DPAD_LABEL[dpadMode];
  store.set('dpad', dpadMode);
  layoutBoard();
}

/* ================= 盤の大きさ =================
   十字キーまで画面に収まるよう、余った高さからマスの大きさを決める */
// 右肩に縦に並ぶ「ルール」と「やり直し」は、文字数が違っても同じ幅にそろえる
function alignHeaderButtons(){
  const a=$('btnRules'), b=$('btnReset');
  if(!a||!b) return;
  a.style.minWidth=b.style.minWidth='';                 // 素の幅を測り直す
  const w=Math.ceil(Math.max(a.getBoundingClientRect().width, b.getBoundingClientRect().width));
  a.style.minWidth=b.style.minWidth=w+'px';
}
// 手数の中心を「◀ メニュー」の中心にそろえる。ボタンの幅は文字数で変わるので実測する
function alignPushes(){
  const menu=document.querySelector('header .iconbtn');
  const bar=document.querySelector('.stagebar');
  if(!menu||!bar) return;
  const m=menu.getBoundingClientRect(), b=bar.getBoundingClientRect();
  document.documentElement.style.setProperty('--pushx', (m.left+m.width/2-b.left)+'px');
}
// 十字キーの左右に置くボタンの幅ぶんだけ、正方形を狭める。
// 塗りつぶしの正方形なので、重なると誤タップになる。
function sizeDpad(){
  const l=document.querySelector('.footrow .left');
  const r=document.querySelector('.footrow .right');
  const w=Math.max(l?l.getBoundingClientRect().width:0, r?r.getBoundingClientRect().width:0);
  document.documentElement.style.setProperty('--sidekeep', (w>0?Math.ceil(w*2+24):0)+'px');
  // 左右のボタンは、十字キーの上端にそろえて置く。同じ高さの箱にして上詰めにする
  const d=document.querySelector('.dpad');
  const h=d && getComputedStyle(d).display!=='none' ? d.getBoundingClientRect().height : 0;
  document.documentElement.style.setProperty('--dpadh', h>0?(h+'px'):'auto');
}
function layoutBoard(){
  alignHeaderButtons();
  alignPushes();
  sizeDpad();
  if(!puzzle) return;
  const app=document.querySelector('.app');
  const wrap=boardEl.parentElement;
  const pad=6;                                     // 盤のまわりに残す余白
  let used=0;
  for(const el of app.children){
    if(el===wrap) continue;
    // スペーサーは余りを吸う伸縮要素なので、これを足すと余白が常に0になる
    if(el.classList.contains('spacer')) continue;
    if(getComputedStyle(el).display==='none') continue;
    used += el.getBoundingClientRect().height;
  }
  const availW=app.clientWidth - 28 - pad;
  const availH=app.clientHeight - used - pad - 14;
  const cell=Math.max(12, Math.floor(Math.min(availW/puzzle.w, availH/puzzle.h)) - 2);
  document.documentElement.style.setProperty('--cell', cell+'px');
}
window.addEventListener('resize', layoutBoard);

/* ================= 読み込み ================= */
// 面データの取り込み口はここ1か所。1枚のHTMLに固めるときはここを差し替える
function loadJSON(name){
  // 「最新に更新」で入り直したときは、面データもキャッシュを使わずに取り直す
  const fresh=QS.get('fresh');
  const url = fresh ? (name+'?fresh='+encodeURIComponent(fresh)) : name;
  return fetch(url, fresh?{cache:'reload'}:undefined)
    .then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); });
}
function showLoading(t){ if(t) $('loadingText').textContent=t; $('loading').classList.add('show'); }
const hideLoading=()=>$('loading').classList.remove('show');

showLoading();
loadJSON(FILE)
  .then(data=>{
    LEVELS=data.levels;
    REV = data.reordered ? (data.reordered.at+'@'+data.reordered.from) : 'normal';
    hideLoading();
    // 送られてきたリンクは、その1面だけを独立して遊べるようにする
    SHARED = !DEBUG && !MOD && WANT>=1 && WANT<=LEVELS.length && (WANT-1)!==unlockedMax();
    // ★の見立ての目盛りは面数に合わせる
    setFavRange(LEVELS.length);
    if(DEBUG){
      $('btnFav').style.display='';
      $('btnFavWin').style.display='';
    }
    if(MOD){
      $('btnBad').style.display='';
      $('btnBadWin').style.display='';
      $('btnFav').style.display='';
      $('btnFavWin').style.display='';
      $('banner').style.display='block';
      $('bannerText').textContent='モデレーション中。良い面は ★、良くない面は ✕';
    }
    if(SHARED){
      $('banner').style.display='block';
      $('bannerText').textContent='📨 送られてきたステージです。本編の進みには影響しません';
      $('btnBackHome').style.display='';
      $('btnHist').style.display='none';
      $('stageLabel').textContent='送られたステージ';
    }
    const co=QS.get('co') && dec(QS.get('co'));
    // 協力プレイを止めている間は、送られてきたリンクも本編として開く
    if(COOP_ON && co && co.b && co.lv){ coResume(co); return; }
    takeMoveFromUrl();                    // 引っ越しは、始める面を決める前に取り込む
    const start=(WANT>=1&&WANT<=LEVELS.length) ? WANT-1 : unlockedMax();
    startLevel(start);
    // ?history=1 は、右下のボタンを押したのと同じ。履歴を開いた状態で始める
    if(QS.get('history')==='1' && !MOD && !EDIT && !SHARED) openHist();
  })
  .catch(e=>showLoading('面の読み込みに失敗しました ('+e.message+')'));

/* ================= 全状態の表(デバッグ用・裏で計算) ================= */
let tableWorker=null, tableReq=0, hintPending=false;   // false = 使えないと分かった
// 表ができたときにすることは1か所にまとめる(裏で作っても、その場で作っても同じ)
function tableReady(){
  updateStats();
  if(coop){ coJudge(coMoved); return; }             // 協力プレイは自前の文言で知らせる
  if(hintPending){ hintPending=false; hint(); }
  else if(dist) checkDead();
}
// Worker は、要るモード(デバッグ・協力プレイ)で初めて要求されたときに作る
function ensureWorker(){
  if(tableWorker!==null || tableWorker===false) return;
  try{
    tableWorker=new Worker(ASSET+'table-worker.js');
    tableWorker.onmessage=e=>{
      if(e.data.id!==tableReq) return;              // 古い面の結果は捨てる
      dist = e.data.entries ? new Map(e.data.entries) : null;
      tableReady();
    };
    // Worker が使えない場所(埋め込み先の制限など)では、その場で作り直す
    tableWorker.onerror=()=>{ tableWorker=false; requestTable(); };
  }catch(err){ tableWorker=false; }
}
function requestTable(){
  ensureWorker();
  const id=++tableReq;
  if(tableWorker){
    tableWorker.postMessage({id, grid:puzzle.grid, w:puzzle.w, goals:puzzle.goals, cap:3000000});
    return;
  }
  // Worker が使えない環境ではこの場で作る。重い盤があるので画面を描いてから
  showMsg('詰み判定の表を作っています…');
  setTimeout(()=>{
    if(id!==tableReq) return;                       // その間に面が変わったらやめる
    dist=solvableStates(puzzle.grid, puzzle.w, puzzle.goals, 3000000);
    hideMsg();
    tableReady();
  },0);
}

/* ================= 面の開始 ================= */
function startLevel(i){
  index=Math.max(0, Math.min(LEVELS.length-1, i));
  const lv=LEVELS[index];
  effortStart(lv);
  puzzle=parseBoard(lv.b);
  puzzle.meta=lv;
  // 全状態の表は詰み判定とヒントにしか使わない。通常プレイでは作らない。
  // デバッグ時も裏で作る(大きい盤だと数秒かかるため、画面は止めない)
  dist=null;
  // 全局面の表は「ふつうのルール」で作ったもの。水や穴のルールでは中身が違うので、
  // 使うと詰み表示もヒントも狂う。ルール違いでは最初から作らない
  if((DEBUG||coop) && RULE==='plain') requestTable();
  goalSet=new Set(puzzle.goals);
  boxes=puzzle.boxes.slice();
  player=puzzle.player;
  undoStack=[]; pushCount=0; moveCount=0;
  // リスの穴。最初から穴の上にあるドングリ(*)は、埋まっているものとして始める
  filled=new Set();
  if(RULE==='holes'){
    boxes.filter(b=>goalSet.has(b)).forEach(b=>filled.add(b));
    boxes=boxes.filter(b=>!goalSet.has(b));
  }
  finished=false; deadShown=false; hintPending=false;
  $('overlay').classList.remove('show');
  $('favPanel').classList.remove('show');
  favFromWin=false;
  editOrigin=null; editDirty=false;
  hideMsg();
  buildBoard();
  layoutBoard();
  updateStats();
  updateFavButton();
  updateBadButton();
  updateReplayBanner();
  // チュートリアル面は、その面で覚えることを一言だけ出す
  if(lv.note){
    $('banner').style.display='block';
    $('bannerText').textContent='💡 '+lv.note;
  }else if(PACK && !SHARED){
    $('banner').style.display='none';
  }
  if(NAV) updateNav();
  // debug は URL に書かない。書くと履歴に残った URL から復活し続けて外せなくなる
  const q=(MOD?'mod=1&':'')+((SHARED||DEBUG||MOD)?('lv='+(index+1)):'');
  try{ history.replaceState(null,'', q?('?'+q.replace(/&$/,'')):location.pathname); }catch(e){}
}

let cellEls=[], outsideMask=null;
function computeOutside(){
  const {grid,w}=puzzle;
  const m=new Uint8Array(grid.length).fill(1);
  for(let i=0;i<grid.length;i++){
    if(grid[i]) continue;
    m[i]=0;
    for(const d of [1,-1,w,-w,w+1,w-1,-w+1,-w-1]){
      const q=i+d;
      if(q>=0&&q<grid.length) m[q]=0;
    }
  }
  return m;
}
function buildBoard(){
  boardEl.innerHTML='';
  boardEl.style.gridTemplateColumns='repeat('+puzzle.w+',var(--cell))';
  outsideMask=computeOutside();
  cellEls=[];
  for(let i=0;i<puzzle.grid.length;i++){
    const d=document.createElement('div');
    d.className='cell';
    const fig=document.createElement('span');
    fig.className='fig';
    d.appendChild(fig);
    boardEl.appendChild(d);
    cellEls.push(d);
  }
  paint();
}
function paint(){
  const boxSet=new Set(boxes);
  for(let i=0;i<cellEls.length;i++){
    const el=cellEls[i], fig=el.firstChild;
    const wall=puzzle.grid[i], goal=goalSet.has(i), box=boxSet.has(i);
    const outside=wall&&outsideMask&&outsideMask[i];
    const wet=puzzle.water && puzzle.water[i];
    const hole = RULE==='holes' && goal;
    const shut = hole && filled.has(i);
    el.className='cell'+(outside?' void':wall?' wall':'')+(wet?' water':'')
      +(hole ? (shut?' shut':' hole') : (goal&&!box?' goal':''))
      +(box?' box':'')+(box&&goal&&!hole?' on':'');
    fig.textContent = box ? SKIN.box : (i===player ? SKIN.man : '');
  }
}

/* ================= 表示 ================= */
function updateStats(){
  $('stageNo').textContent = puzzle ? (index+1) : '--';
  $('pushes').textContent = pushCount;
  if(DEBUG && puzzle){
    const lv=puzzle.meta, b=bestOf(lv);
    const tags=[];
    if(lv.g>=3) tags.push('素直に押すと詰む');
    if(lv.og) tags.push('置き場からどける');
    if(lv.f>=2) tags.push('一本道あり');
    // 罠率と全局面の表は、ふつうのルールでしか意味がない
    $('boardNote').textContent='最短'+lv.p+'手'
      +(RULE==='plain' ? ' / 罠率'+lv.tr+'%' : ' / '+RULE)
      +' / 自己ベスト'+(b==null?'--':b+'手')
      +(RULE==='plain' ? ' / 表'+(dist?dist.size+'状態':'計算中…') : '')
      +' / 音'+(!AC?'非対応':!actx?'未作成':actx.state)
      +'(触'+audioLog.touch+' 作'+audioLog.make+' 起'+audioLog.resume+' 波'+audioLog.wav
      +' 道'+(audioLog.ses||'-')
      +(audioLog.err?' '+audioLog.err:'')+')'
      +'\n'+(lv.sh||'-')+' '+(lv.sz||'')+' '+(lv.gp||'')+' '+tags.join(' ');
  }
}
function updateNav(){
  $('btnPrev').disabled = index<=0;
  $('btnNext').disabled = index>=LEVELS.length-1;
}

/* ================= ★と、難易度の見立て ================= */
function updateFavButton(){
  if(!puzzle) return;
  const f=favs[puzzle.meta.id];
  const label = f ? ('★ '+(f.place||'')).trim() : '★';
  for(const id of ['btnFav','btnFavWin']){
    const b=$(id);
    b.textContent=label;
    b.classList.toggle('on', !!f);
    b.title = f ? '★を外す' : '★を付ける';
  }
}
// ★ボタンは付け外しだけ。付けるときだけ「何面くらいか」を聞くパネルを出す
function toggleFav(fromWin){
  if(!puzzle) return;
  if(favs[puzzle.meta.id]){ removeFav(); return; }
  const def = index+1;
  saveFav(MOD ? null : def);
  if(MOD) return;                                  // モデレーションでは見立てを聞かない
  favFromWin=!!fromWin;
  if(favFromWin) $('overlay').classList.remove('show');   // クリア画面をいったん引っ込める
  $('favRange').value=def;
  $('favVal').textContent=def;
  $('favPanel').classList.add('show');
  layoutBoard();
}
// 「指定しない」= ★は付けたまま、何面くらいかの見立てだけ空にする
function skipFavPlace(){
  if(puzzle&&favs[puzzle.meta.id]){ favs[puzzle.meta.id].place=null; saveFavs(); updateFavButton(); }
  closeFavPanel();
}
function closeFavPanel(){
  $('favPanel').classList.remove('show');
  layoutBoard();
  if(favFromWin){ favFromWin=false; $('overlay').classList.add('show'); }
}
function saveFav(place){
  const lv=puzzle.meta;
  favs[lv.id]={b:lv.b, place:(place==null?null:+place), from:'第'+(index+1)+'面',
               at:index+1, orig:lv.orig==null?null:lv.orig, rev:REV};
  saveFavs(); updateFavButton();
}
function removeFav(){
  delete favs[puzzle.meta.id];
  saveFavs(); updateFavButton();
  if($('favPanel').classList.contains('show')) closeFavPanel();
}
// keep-levels.json にそのまま貼れる形で書き出す
function exportFavs(){
  const list=Object.keys(favs)
    .map(id=>({b:favs[id].b, at:favs[id].place||null, note:favs[id].from}))
    .sort((a,b)=>(a.at||9999)-(b.at||9999));
  if(!list.length){ alert('まだ★が付いていません。'); return; }
  const text=JSON.stringify(list, null, 1);
  const url=URL.createObjectURL(new Blob([text], {type:'application/json'}));
  const a=document.createElement('a');
  a.href=url;
  a.download='keep-levels.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
  showMsg('★ '+list.length+'面を keep-levels.json に書き出しました。');
}

/* ================= 局面 ================= */
function stateKeyNow(){
  const b=boxes.slice().sort((x,y)=>x-y);
  const r=regionRep(puzzle.grid, puzzle.w, new Set(b), player);
  return keyOf(b, r.rep);
}
function remainingPushes(){
  if(!dist) return null;
  const d=dist.get(stateKeyNow());
  return d===undefined ? null : d;
}

/* ================= 移動 ================= */
function dirOffset(name){
  const w=puzzle.w;
  return name==='up'?-w : name==='down'?w : name==='left'?-1 : 1;
}
function move(name, fromReplay){
  if(!puzzle||finished||EDIT) return;
  if(coReplay && !fromReplay){ coSkip=true; return; }   // 再生中に触られたら飛ばす
  if(!fromReplay) ensureAudio(true);
  if(!fromReplay) effortTick();
  const d=dirOffset(name);
  const next=player+d, beyond=player+2*d;
  if(puzzle.grid[next]){ SFX.blocked(); return; }
  // リス。空いた穴には落ちてしまうので入れない。埋めた穴は地面と同じ
  if(RULE==='holes' && goalSet.has(next) && !filled.has(next) && boxes.indexOf(next)<0){
    SFX.blocked(); return;
  }
  const bi=boxes.indexOf(next);
  if(bi>=0){
    if(puzzle.grid[beyond]||boxes.includes(beyond)){ SFX.blocked(); return; }
    // 夏。水にはダンボールを押し込めない(自機は歩ける)
    if(puzzle.water && puzzle.water[beyond]){ SFX.blocked(); return; }
    // 協力プレイでは、1手番に動かせる荷物は1個だけ
    if(coop && !fromReplay){
      if(coop.e){ SFX.blocked(); return; }                   // 決着ずみ
      if(coBox>=0 && coBox!==next){
        SFX.blocked();
        showMsg('この手番で動かせるのは1個だけです。送り返してください。', true);
        return;
      }
    }
    undoStack.push({player, boxes:boxes.slice(), pushCount, moveCount, filled:new Set(filled)});
    // 冬(滑る)。氷は壁か別の氷にぶつかるまで進む。それ以外のルールでは1マス
    let dest=beyond;
    if(RULE==='slide'){
      while(true){
        const n=dest+d;
        if(puzzle.grid[n]||boxes.includes(n)) break;
        dest=n;
      }
    }
    const drop = RULE==='holes' && goalSet.has(dest) && !filled.has(dest);
    if(drop){ boxes.splice(bi,1); filled.add(dest); }   // 穴に落ちて埋まる
    else boxes[bi]=dest;
    // 冬は、押しても押した先のマスに入らない。その場に留まる。
    // (空いたマスへはいつでも歩いて入れるので、自機の行ける範囲は変わらない。
    //  つまり最短の押し手数は他のモードと同じで、面の記録もそのまま使える)
    // 冬の見た目版は「押しても入らない」。滑るルールでは氷のいた場所へ入る
    if(!(skinName==='winter' && RULE==='plain')) player=next;
    pushCount++; moveCount++;
    paint();
    if(skinName==='winter'){
      glide(dest, d, RULE==='slide' ? (dest-beyond)/d + 1 : 1);   // ぶつかるまで滑る
      if(RULE!=='plain') slide(player, d);   // 滑るルールでは自機も動く
      sweat(player, RULE==='plain'?0:d);
    }else{
      slide(dest, d); slide(player, d);      // 荷物と自分が、いた場所から滑ってくる
      sweat(player, d);
    }
    if(coop){ coBox=dest; coMoved=true; }                  // 次はこの荷物だけ動かせる
    if(goalSet.has(dest)){ SFX.onGoal(); setTimeout(()=>bump(dest),110); }
    else SFX.push();
  }else{
    undoStack.push({player, boxes:boxes.slice(), pushCount, moveCount});
    player=next;
    moveCount++;
    paint(); slide(player, d); SFX.step();
  }
  updateStats();
  clearHint();
  if(coop){
    if(!fromReplay) coTurn+=MVCODE[name]||'';   // 自分の手番の動きを覚えておく
    if(fromReplay) return;
    if(bi>=0) coJudge(true); else updateCoBanner();
    return;                                     // 協力プレイは自前で判定する
  }
  if(checkWin()) return;
  if(DEBUG) checkDead();
}
const SLIDE_MS=110;                       // .cell .fig の transition と合わせる
const GLIDE_MS=500;                       // 冬の氷。.cell .fig.glide と合わせる
const stepMs=()=>skinName==='winter'?GLIDE_MS:SLIDE_MS;
// 氷を1マスぶん手前に置いてから、ゆっくり定位置へ滑らせる
// n マスぶん手前から滑らせる(滑るルールでは何マスも進むことがある)
function glide(i, d, n){
  const fig=cellEls[i] && cellEls[i].firstChild;
  if(!fig) return;
  const step=(cellEls[i].getBoundingClientRect().width + 2) * (n||1);
  const dx=(d===1?-1:d===-1?1:0)*step;
  const dy=(d===puzzle.w?-1:d===-puzzle.w?1:0)*step;
  fig.classList.add('sliding');
  fig.style.transform=`translate(${dx}px,${dy}px)`;
  void fig.offsetWidth;
  fig.classList.remove('sliding');
  fig.classList.add('glide');
  fig.style.transform='';
  setTimeout(()=>fig.classList.remove('glide'), GLIDE_MS+40);
}
// 移動したマスの絵を、1マスぶん手前に置いてから定位置へ戻す
function slide(i, d){
  const fig=cellEls[i] && cellEls[i].firstChild;
  if(!fig) return;
  const step=cellEls[i].getBoundingClientRect().width + 2;   // マスの幅 + すき間
  const dx=(d===1?-1:d===-1?1:0)*step;
  const dy=(d===puzzle.w?-1:d===-puzzle.w?1:0)*step;
  fig.classList.add('sliding');
  fig.style.transform=`translate(${dx}px,${dy}px)`;
  void fig.offsetWidth;                                       // ここで一度置き直させる
  fig.classList.remove('sliding');
  fig.style.transform='';
}
// 押した瞬間に、ヒヨコのいるマスへ汗を1つ足す。
// ヒヨコと一緒に滑ってきて、0.25秒で右下へ抜けて消える
function sweat(i, d){
  const el=cellEls[i];
  if(!el) return;
  const wrap=document.createElement('span');
  wrap.className='sweat';
  const drop=document.createElement('i');
  drop.className='drop';
  drop.textContent='💦';
  wrap.appendChild(drop);
  el.appendChild(wrap);                    // 先頭は絵の要素なので、必ず後ろに足す
  // ヒヨコと同じだけ、いた場所から滑ってくる
  const step=el.getBoundingClientRect().width + 2;
  const dx=(d===1?-1:d===-1?1:0)*step;
  const dy=(d===puzzle.w?-1:d===-puzzle.w?1:0)*step;
  wrap.style.transition='none';
  wrap.style.transform=`translate(${dx}px,${dy}px)`;
  void wrap.offsetWidth;                   // ここで一度置き直させる
  wrap.style.transition='transform .11s ease-out';
  wrap.style.transform='';
  setTimeout(()=>{ if(wrap.parentNode) wrap.remove(); }, 270);
}
function bump(i){
  const el=cellEls[i];
  el.classList.add('bump');
  setTimeout(()=>el.classList.remove('bump'),200);
}
function undo(){
  if(!undoStack.length||finished||coop) return;
  effort.u++;
  const s=undoStack.pop();
  player=s.player; boxes=s.boxes; pushCount=s.pushCount; moveCount=s.moveCount;
  if(s.filled) filled=s.filled;
  paint(); updateStats(); clearHint(); hideMsg();
  deadShown=false; SFX.undo();
}
function resetLevel(){
  if(!puzzle||finished||coop) return;        // 協力プレイでは押し直せない
  effort.r++;
  boxes=puzzle.boxes.slice(); player=puzzle.player;
  filled=new Set();
  if(RULE==='holes'){
    boxes.filter(b=>goalSet.has(b)).forEach(b=>filled.add(b));
    boxes=boxes.filter(b=>!goalSet.has(b));
  }
  undoStack=[]; pushCount=0; moveCount=0;
  deadShown=false;
  paint(); updateStats(); clearHint(); hideMsg();
}

/* ================= 詰み検知(デバッグのみ) ================= */
function checkDead(){
  if(RULE!=='plain') return;      // ふつうのルール用の表しか無い
  if(!dist) return;      // 表がまだ届いていない間は詰み表示なし
  if(dist.has(stateKeyNow())){ if(deadShown){ deadShown=false; hideMsg(); } return; }
  if(deadShown) return;
  deadShown=true; SFX.dead();
  showMsg('この配置からはもう完成できません。', true);
}

/* ================= ヒント(デバッグのみ) ================= */
let hintEls=[];
function clearHint(){
  for(const el of hintEls) el.remove();
  hintEls=[];
  for(const el of cellEls) el.classList.remove('hintbox');
}
function hint(){
  if(!puzzle||finished) return;
  if(!dist){                                   // まだ計算中。届いたら自動で出す
    hintPending=true;
    showMsg('全状態を計算しています… 少し待ってください');
    return;
  }
  clearHint();
  const d=remainingPushes();
  if(d===null){ showMsg('この配置からはもう完成できません。', true); return; }
  if(d===0) return;
  const b=boxes.slice().sort((x,y)=>x-y);
  const r=regionRep(puzzle.grid, puzzle.w, new Set(b), player);
  const next=pushesFrom(puzzle.grid, puzzle.w, b, r.cells).filter(mv=>dist.get(mv.key)===d-1);
  if(!next.length){ showMsg('この配置からはもう完成できません。', true); return; }
  const m={from:next[0].box, dir:next[0].dir};
  const w=puzzle.w;
  const arrow = m.dir===-w?'↑' : m.dir===w?'↓' : m.dir===-1?'←' : '→';
  const el=cellEls[m.from];
  el.classList.add('hintbox');
  const tag=document.createElement('span');
  tag.className='arrowtag';
  tag.textContent=arrow;
  el.appendChild(tag);
  hintEls.push(tag);
  showMsg('光っている箱を '+arrow+' に押すと最短。残り '+d+' 押し。');
}

let msgTimer=null;
function showMsg(text, warn){
  const el=$('msg');
  el.textContent=text;
  el.className='msg'+(warn?' warn':'');
  el.style.display='block';
  layoutBoard();
  clearTimeout(msgTimer);
  msgTimer=setTimeout(hideMsg, 9000);
}
function hideMsg(){ clearTimeout(msgTimer); $('msg').style.display='none'; layoutBoard(); }

/* ================= クリア ================= */
let shareData=null;
function checkWin(){
  if(RULE==='holes'){ if(boxes.length) return false; }
  else if(!boxes.every(b=>goalSet.has(b))) return false;
  finished=true;
  clearHint(); hideMsg();
  SFX.win();
  const lv=puzzle.meta;
  const prev=bestOf(lv);
  const first=prev===undefined;
  // 送られてきた1面は、本編の進みには足さない
  if(!SHARED && !MOD && (first||pushCount<prev)){ progress.cleared[lv.id]=pushCount; saveProgress(); }
  if(!SHARED && !MOD && !coop) effortDone(lv, pushCount);   // 手こずり具合は初回だけ
  updateStats();
  updateBadButton();
  updateReplayBanner();                 // 自己ベストが縮んだら、帯の表示も直す
  if(NAV) updateNav();

  const perfect=pushCount===lv.p;
  $('winTitle').textContent = SHARED ? 'クリア！' : ('ステージ'+(index+1)+' クリア！');
  $('winVerdict').textContent = perfect ? '✨ 最短クリア！'
    : replaying ? ('最短まで あと'+(pushCount-lv.p)+'手') : '';
  $('winVerdict').className = 'win-verdict'+(!perfect&&replaying?' miss':'');
  $('winPush').textContent=pushCount+'手';
  if(replaying){
    const rows=histRows();
    $('winSub').innerHTML='このステージの最短は <b>'+lv.p+'手</b>'
      +'<br>自己ベスト '+bestOf(lv)+'手'
      +'<br>最短で解けた面 '+rows.filter(r=>r.perfect).length+' / '+rows.length;
    $('btnNextStage').textContent = perfect ? '履歴にもどる' : 'もう一度';
  }else{
    $('winSub').innerHTML='このステージの最短は <b>'+lv.p+'手</b>'
      +(first||SHARED?'':'<br>自己ベスト '+Math.min(prev,pushCount)+'手')
      // 全体で何面あるかは出さない。先が見えないほうがいい
      +(SHARED?'':'<br>クリア '+clearedCount()+'面');
    const last=index>=LEVELS.length-1;
    $('btnNextStage').textContent = SHARED ? '本編へ' : (last ? 'とじる' : '次のステージへ');
  }
  // 着せ替え中は、その着せ替え専用の入口を送る。
  // 送り先のアプリは静的な meta しか読まないので、絵を変えるにはこれしかない
  const base=location.origin+location.pathname.replace(/(beetle|squirrel|winter)\/$/,'');
  shareData={
    url: base+(skinName==='normal'?'':skinName+'/')+'?lv='+(index+1),
    text:'「倉庫パズル」ステージ'+(index+1)+'を'+pushCount+'手でクリア！(最短'+lv.p+'手)',
  };

  // お祝いの animation は fig の transform を奪うので、
  // 最後の一手が滑り終わるのを待ってから始める(でないと決め手だけ瞬間移動して見える)
  setTimeout(()=>{
    boardEl.classList.add('celebrate');
    cellEls.forEach((el,i)=>{ el.firstChild.style.animationDelay=(((i/puzzle.w|0)+(i%puzzle.w))*45)+'ms'; });
    setTimeout(()=>{
      boardEl.classList.remove('celebrate');
      cellEls.forEach(el=>{ el.firstChild.style.animationDelay=''; });
      $('overlay').classList.add('show');
    },1100);
  }, stepMs()+20);
  return true;
}
function nextStage(){
  $('overlay').classList.remove('show');
  if(SHARED){ location.href=location.pathname; return; }
  if(replaying){
    // 最短が出るまでは同じ面。出たら、次の面へ進めずに履歴へもどす
    if(pushCount!==puzzle.meta.p) startLevel(index);
    else openHist();
    return;
  }
  if(index<LEVELS.length-1) startLevel(index+1);
}

/* ================= ステージ選択(デバッグ) ================= */
let chapter=0;
const CHAPTER=100;                 // 1グループ100面 = 10×10のマス目ぴったり
function openPicker(){
  chapter=Math.floor(index/CHAPTER);
  renderPicker();
  $('pickOverlay').classList.add('show');
}
function renderPicker(){
  const chapters=Math.ceil(LEVELS.length/CHAPTER);
  const ch=$('chapters');
  ch.innerHTML='';
  for(let c=0;c<chapters;c++){
    const b=document.createElement('button');
    b.textContent=(c*CHAPTER+1)+'〜';
    if(c===chapter) b.classList.add('active');
    b.addEventListener('click',()=>{ chapter=c; renderPicker(); });
    ch.appendChild(b);
  }
  const grid=$('stageGrid');
  grid.innerHTML='';
  const from=chapter*CHAPTER, to=Math.min(from+CHAPTER, LEVELS.length);
  for(let i=from;i<to;i++){
    const b=document.createElement('button');
    b.textContent=i+1;
    if(isCleared(LEVELS[i])) b.classList.add('cleared');
    if(i===index) b.classList.add('current');
    b.addEventListener('click',()=>{ $('pickOverlay').classList.remove('show'); startLevel(i); });
    grid.appendChild(b);
  }
}

/* ================= 協力プレイ =================
   交互に、荷物を1個だけ動かして送り合う。動かす回数は何回でもよい。
   押した結果その面が解けなくなったら、押した人の負け。
   判定は受け取った端末が自分で計算するので、審判もサーバも要らない。 */
const enc=o=>btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const dec=t=>{ try{ return JSON.parse(decodeURIComponent(escape(atob(t.replace(/-/g,'+').replace(/_/g,'/'))))); }catch(e){ return null; } };
// co = {lv:面番号, b:荷物, p:自機, n:何手目, m:相手が動かした荷物, e:終わり方}
let coop=null;          // 協力プレイ中の状態
let coBox=-1;           // この手番で動かしている荷物(1個だけ)
let coMoved=false;      // この手番で1回でも押したか
let coBack=0;           // 協力を始める前に遊んでいた面(やめたら戻る)
let coTurn='';          // この手番でこちらが動かした向き(送るときに渡す)
let coHist=[];          // これまでの全手番の動き(相手の動きを再生するのに使う)
let coReplay=false;     // 再生中は入力を受けない
let coKey='';           // 受け取った局面の目印(開き直して取り消せないようにする)
function coLostKeys(){
  try{ return JSON.parse(store.get('colost')||'[]')||[]; }catch(e){ return []; }
}
function coMarkLost(){
  if(!coKey) return;
  const a=coLostKeys().filter(x=>x!==coKey);
  a.push(coKey);
  store.set('colost', JSON.stringify(a.slice(-30)));
}
const MV={u:'up', d:'down', l:'left', r:'right'};
const MVCODE={up:'u', down:'d', left:'l', right:'r'};
// 手順を、実際に動かして見せる。長いほど速く送る(全体で6秒くらいに収める)
let coSkip=false;
function coPlay(moves, done){
  if(!moves||!moves.length){ done&&done(); return; }
  coReplay=true; coSkip=false;
  const wait=Math.max(45, Math.min(190, Math.round(6000/moves.length)));
  let i=0;
  const step=()=>{
    if(coSkip){                              // 触られたら、残りは一気に進める
      while(i<moves.length){ const m=MV[moves[i++]]; if(m) move(m, true); }
    }
    if(i>=moves.length){ coReplay=false; coSkip=false; done&&done(); return; }
    const m=MV[moves[i++]];
    if(m) move(m, true);
    setTimeout(step, wait);
  };
  setTimeout(step, 400);
}
// 面はその場の面ではなく、くじで選ぶ。二人とも初見のほうが面白い。
// 第301面から先はこれから並べ直すので、当面は第300面まで。
// 数手で終わる面は勝負にならないので、ある程度の手数があるものだけ
const CO_MAX=300, CO_MIN_PUSH=8;
function coPick(){
  const ok=[];
  for(let i=0;i<Math.min(CO_MAX, LEVELS.length);i++) if(LEVELS[i].p>=CO_MIN_PUSH) ok.push(i);
  if(!ok.length) return index;
  return ok[Math.floor(Math.random()*ok.length)];
}
/* 協力プレイは、いったん止めてある(2026-08-18、本人の指示)。
   作りは丸ごと残してあるので、復活させるときはここを true に戻す。
   止めるのはここ1箇所。ボタンを隠し、送られてきたリンクも開かない */
const COOP_ON=false;
function coStart(){
  if(!COOP_ON) return;
  if(!puzzle) return;
  coBack=index;
  const i=coPick();
  startLevel(i);
  coop={lv:i+1, n:0, m:-1};
  coBox=-1; coMoved=false; coTurn=''; coHist=[];
  document.body.classList.add('co');
  requestTable();
  showMsg('協力プレイ。くじで第'+(i+1)+'面が選ばれました。'
    +'荷物を1個だけ動かして、相手に送ってください。'
    +'（動かす回数は何回でも。押した手は取り消せません。詰ませたら負けです）');
  updateCoBanner();
}
function coQuit(){
  const back=coBack;
  coop=null; coBox=-1; coMoved=false; coTurn=''; coHist=[]; coKey='';
  coReplay=false;
  document.body.classList.remove('co');
  $('banner').style.display='none';
  hideMsg();
  $('btnCo').innerHTML='<i>🤝</i>協力';       // 文字を戻さないと、次に押したとき始まってしまう
  startLevel(back);
}
function updateCoBanner(){
  $('btnCo').innerHTML = coop ? 'やめる' : '<i>🤝</i>協力';
  if(!coop) return;
  if(coReplay){                              // 再生の途中は、そう書いておく
    $('banner').style.display='block';
    $('bannerText').textContent='🤝 ここまでの動きを再生中…（触ると飛ばせます）';
    $('btnCoSend').disabled=true;
    return;
  }
  $('banner').style.display='block';
  const t = coop.e==='lost' ? '詰ませてしまいました。あなたの負けです'
          : coop.e==='oplost' ? '相手が詰ませました。あなたの勝ちです'
          : coop.e==='won'  ? '二人でクリア！'
          : coMoved ? ('荷物を動かしました。「'+(coop.n===0?'送る':'送り返す')+'」で相手の番にできます')
          : (coop.n===0 ? '協力プレイ 第'+coop.lv+'面 ／ あなたが1手目です'
                        : '協力プレイ '+coop.n+'手目 ／ あなたの番');
  $('bannerText').textContent='🤝 '+t;
  // 1手目はまだ何も受け取っていないので「送り返す」ではない
  $('btnCoSend').textContent = coop.e==='lost' ? '負けを伝える'
    : coop.e==='oplost' ? '結果を伝える'
    : coop.e==='won' ? 'クリアを伝える'
    : coop.n===0 ? '送る' : '送り返す';
  $('btnCoSend').disabled = !coMoved && !coop.e;
}
function coSend(){
  if(!coop) return;
  const o={lv:coop.lv, b:boxes.slice().sort((a,b)=>a-b), p:player, n:coop.n+1, m:coBox,
           h:coHist.concat(coTurn)};
  // 結果は相手から見た形にして渡す(自分の負け=相手の勝ち)
  if(coop.e==='lost') o.e='lost';
  else if(coop.e==='oplost') o.e='youlost';
  else if(coop.e==='won') o.e='won';
  const url=location.origin+location.pathname+'?co='+enc(o);
  const text = coop.e==='lost' ? '「倉庫パズル」協力プレイ：詰ませてしまいました…🤝'
    : coop.e==='won' ? '「倉庫パズル」協力プレイ：二人でクリア！🤝'
    : '「倉庫パズル」協力プレイ '+coop.n+'手目。次はあなたの番です🤝';
  shareLink(url, text);
}
// 受け取った局面から始める
function coResume(o){
  const i=Math.max(0, Math.min(LEVELS.length-1, (o.lv|0)-1));
  startLevel(i);
  coop={lv:i+1, n:o.n|0, m:(o.m===undefined?-1:o.m), e:o.e};
  coBox=-1; coMoved=false; coTurn='';
  coHist=Array.isArray(o.h)?o.h.slice():[];
  coKey=coop.lv+':'+coop.n+':'+(o.b||[]).join(',');
  if(!coop.e && coLostKeys().indexOf(coKey)>=0) coop.e='lost';   // 一度詰ませた局面
  undoStack=[]; pushCount=0;
  document.body.classList.add('co');
  // 最初からの全部を見せる。どう組み立ててきたかが分かるほうが面白い
  const all=coHist.join('');
  const finish=()=>{
    // 手順から再現できないときは、送られてきた盤をそのまま使う
    if(o.b && (boxes.slice().sort((a,b)=>a-b).join()!==o.b.slice().sort((a,b)=>a-b).join() || player!==(o.p|0))){
      boxes=o.b.slice(); player=o.p|0; paint();
    }
    coBox=-1; coMoved=false; pushCount=0;
    undoStack=[];
    updateStats();
    if(coop.m>=0 && cellEls[coop.m]){        // 相手が動かした荷物を光らせる
      cellEls[coop.m].classList.add('came');
      setTimeout(()=>cellEls[coop.m]&&cellEls[coop.m].classList.remove('came'), 2500);
    }
    coJudge(false);                          // 届いた局面がもう詰んでいないか
    updateCoBanner();
  };
  paint();
  updateCoBanner();
  requestTable();                            // 詰み判定に使う表を用意する
  if(all){
    $('bannerText').textContent='🤝 ここまでの動きを再生中…（触ると飛ばせます）';
    $('banner').style.display='block';
    coPlay(all, finish);
  }else finish();
  if(o.e==='lost'){ coop.e='oplost'; showMsg('相手が詰ませました。あなたの勝ちです。', true); }
  else if(coop.e==='lost'){ showMsg('この局面では、あなたが詰ませています。やり直しはできません。', true); }
  else if(coop.e==='youlost'){ coop.e='lost'; showMsg('あなたが詰ませていました。負けです。', true); }
  else if(coop.e==='won') showMsg('二人でクリアしました！');
  else showMsg('相手が動かした荷物が光っています。あなたも荷物を1個だけ動かして、送り返してください。');
}
/* まだ解けるかを見る。
   mine=true は自分が押した直後。詰んでいたら自分の負け。
   mine=false は受け取った直後(まだ押していない)。詰んでいたら、詰ませたのは相手。
   歩くだけでは解けるかどうかは変わらないので、押したときだけ見ればよい。 */
function coJudge(mine){
  if(!coop) return;
  if(!coop.e){
    if(boxes.every(b=>goalSet.has(b))) coop.e='won';
    else if(dist){                           // 表がまだ無い(大きい盤)ときは判定しない
      const r=regionRep(puzzle.grid, puzzle.w, new Set(boxes), player);
      const k=keyOf(boxes.slice().sort((a,b)=>a-b), r.rep);
      if(!dist.has(k)){
        if(mine){
          coop.e='lost';
          coMarkLost();                      // 開き直しても取り消せないように
          showMsg('この手で解けなくなりました。あなたの負けです。', true);
        }else{
          coop.e='oplost';                   // 届いた時点で詰んでいた
          showMsg('届いた局面は、もう解けなくなっています。相手の負けです。', true);
        }
      }
    }
  }
  updateCoBanner();
}

/* ================= クリア履歴 =================
   クリア済みの面を、自己ベストと最短をならべて出す。選べば、最短が出るまで
   何度でも解き直せる。本編の進みは変えない。自己ベストは、縮んだときだけ書き換わる */
function histRows(){
  const rows=[];
  for(let i=0;i<LEVELS.length;i++){
    const lv=LEVELS[i];
    if(!isCleared(lv)) continue;
    const best=bestOf(lv);
    rows.push({i, lv, best, known:best!==NOREC, perfect:best===lv.p});
  }
  return rows;
}
let histChapter=null;            // null = 全部
let histOnlyLeft=false;          // まだ最短でない面だけ
function openHist(){
  // 開くたび、いま遊んでいる面のある章から見せる
  const rows=histRows();
  const here=rows.find(r=>r.i===index) || rows[rows.length-1];
  if(here && rows.length>CHAPTER) histChapter=Math.floor(here.i/CHAPTER);
  renderHist();
  $('histOverlay').classList.add('show');
}
function renderHist(){
  const all=histRows();
  const done=all.filter(r=>r.perfect).length;
  $('histSum').textContent = all.length
    ? ('クリア済み '+all.length+'面のうち、最短で解けたのは '+done+'面'
       + (replaying?'':'\n面を選ぶと、その面を解き直せます'))
    : 'まだクリアした面がありません。';

  // 絞り込み → 章タブ の順に見る。絞った結果、空になった章は出さない
  const kept=all.filter(r=>!histOnlyLeft || !r.perfect);
  const chapters=[...new Set(kept.map(r=>Math.floor(r.i/CHAPTER)))].sort((x,y)=>x-y);
  if(histChapter!==null && chapters.indexOf(histChapter)<0) histChapter=null;
  const ch=$('histChapters');
  ch.innerHTML='';
  // 章が1つしかないなら、タブを出す意味がない
  if(chapters.length>1){
    const tab=(label,val)=>{
      const b=document.createElement('button');
      b.textContent=label;
      if(histChapter===val) b.classList.add('active');
      b.addEventListener('click',()=>{ histChapter=val; renderHist(); });
      ch.appendChild(b);
    };
    tab('全部', null);
    for(const c of chapters) tab((c*CHAPTER+1)+'〜', c);
  }
  const f=$('btnHistFilter');
  f.classList.toggle('on', histOnlyLeft);
  f.textContent = histOnlyLeft ? '最短でない面だけ' : 'すべての面';

  const rows=kept.filter(r=>histChapter===null || Math.floor(r.i/CHAPTER)===histChapter);
  const list=$('histList');
  list.innerHTML='';
  let cur=null;
  for(const r of rows){
    const b=document.createElement('button');
    if(r.perfect) b.classList.add('done');
    if(r.i===index){ b.classList.add('current'); cur=b; }
    const no=document.createElement('span');
    no.className='no'; no.textContent='第'+(r.i+1)+'面';
    const sc=document.createElement('span');
    sc.className='sc';
    sc.textContent = r.perfect ? ('✨ '+r.lv.p+'手 最短')
      : r.known ? (r.best+'手 ／ 最短 '+r.lv.p+'手')
      : ('記録なし ／ 最短 '+r.lv.p+'手');
    const gp=document.createElement('span');
    gp.className='gap';
    gp.textContent = (!r.perfect && r.known) ? ('+'+(r.best-r.lv.p)) : '';
    b.append(no, sc, gp);
    b.addEventListener('click',()=>{ $('histOverlay').classList.remove('show'); startReplay(r.i); });
    list.appendChild(b);
  }
  // いま遊んでいる面が見えるところまで送っておく
  if(cur) setTimeout(()=>{ list.scrollTop = Math.max(0, cur.offsetTop - list.clientHeight/2); }, 0);
}
// 履歴から選んだ面を解き直す
function startReplay(i){
  replaying=true;
  document.body.classList.add('replaying');
  startLevel(i);
}
// 本編の続きにもどる
function exitReplay(){
  replaying=false;
  document.body.classList.remove('replaying');
  $('histOverlay').classList.remove('show');
  $('overlay').classList.remove('show');
  startLevel(unlockedMax());
}
function updateReplayBanner(){
  if(!puzzle) return;
  // 本編にもどったら帯は引っ込める(モデレーションと共有リンクの帯は別物なので触らない)
  if(!replaying){
    if(!MOD && !SHARED) $('banner').style.display='none';
    return;
  }
  const lv=puzzle.meta, b=bestOf(lv);
  $('banner').style.display='block';
  $('bannerText').textContent='解き直し中 ／ この面の最短は '+lv.p+'手'
    + (b===undefined ? '（まだクリアしていない面）'
      : b===NOREC ? '（自己ベストは記録なし）'
      : b===lv.p ? '（もう最短で解けています）'
      : '（自己ベスト '+b+'手）');
}

/* ================= 面編集(?edit=1) ================= */
let tool='wall', editOrigin=null, editDirty=false;
// いまの盤を XSB のテキストに戻す
function boardToXSB(){
  const boxSet=new Set(boxes), rows=[];
  for(let y=0;y<puzzle.h;y++){
    let r='';
    for(let x=0;x<puzzle.w;x++){
      const i=y*puzzle.w+x;
      if(puzzle.grid[i]){ r+='#'; continue; }
      const g=goalSet.has(i), b=boxSet.has(i), m=(i===player);
      r += b ? (g?'*':'$') : m ? (g?'+':'@') : g ? '.' : ' ';
    }
    rows.push(r);
  }
  return rows.join('/');
}
function selectTool(t){
  tool=t;
  document.querySelectorAll('.palette button').forEach(b=>b.classList.toggle('on', b.dataset.tool===t));
}
function editCell(i){
  if(!puzzle) return;
  if(editOrigin===null) editOrigin=boardToXSB();
  const bi=boxes.indexOf(i);
  if(tool==='wall'){
    if(i===player||bi>=0||goalSet.has(i)) return;      // 中身のあるマスは壁にしない
    puzzle.grid[i]=1;
  }else if(tool==='floor'){
    puzzle.grid[i]=0;
    goalSet.delete(i);
    if(bi>=0) boxes.splice(bi,1);
    if(i===player) player=-1;
  }else if(tool==='goal'){
    puzzle.grid[i]=0;
    if(goalSet.has(i)) goalSet.delete(i); else goalSet.add(i);
  }else if(tool==='box'){
    puzzle.grid[i]=0;
    if(bi>=0) boxes.splice(bi,1);
    else { boxes.push(i); boxes.sort((a,b)=>a-b); if(i===player) player=-1; }
  }else if(tool==='man'){
    puzzle.grid[i]=0;
    if(bi>=0) boxes.splice(bi,1);
    player=i;
  }
  puzzle.goals=[...goalSet].sort((a,b)=>a-b);
  puzzle.boxes=boxes.slice();
  editDirty=true;
  dist=null;
  buildBoard(); layoutBoard(); hideMsg();
}
// 盤として成立しているかを、まず形の面で見る
function editProblem(){
  if(player<0) return SKIN.man+' がいません';
  if(!boxes.length) return '荷物がありません';
  if(boxes.length!==goalSet.size) return '荷物 '+boxes.length+'個 に対して置き場 '+goalSet.size+'個';
  const seen=new Uint8Array(puzzle.grid.length);
  const q=[player]; seen[player]=1; let n=1;
  const w=puzzle.w;
  while(q.length){
    const c=q.pop();
    for(const d of [1,-1,w,-w]){
      const t=c+d;
      if(t<0||t>=puzzle.grid.length||puzzle.grid[t]||seen[t]) continue;
      seen[t]=1; n++; q.push(t);
    }
  }
  let floors=0;
  for(let i=0;i<puzzle.grid.length;i++) if(!puzzle.grid[i]) floors++;
  if(n!==floors) return SKIN.man+' から行けない床があります';
  for(const b of boxes) if(!seen[b]) return '触れない荷物があります';
  return null;
}
// 解けるかどうかは、全状態を作って厳密に見る
function editCheck(){
  const bad=editProblem();
  if(bad){ showMsg(bad, true); return null; }
  showMsg('確かめています…');
  return new Promise(res=>setTimeout(()=>{
    const goals=[...goalSet].sort((a,b)=>a-b);
    const table=WarehouseEngine.solvableStates(puzzle.grid, puzzle.w, goals, 3000000);
    if(!table){ showMsg('大きすぎて確かめられません(状態が多すぎます)', true); return res(null); }
    const reg=WarehouseEngine.regionRep(puzzle.grid, puzzle.w, new Set(boxes), player);
    const key=WarehouseEngine.keyOf(boxes.slice().sort((a,b)=>a-b), reg.rep);
    if(!table.has(key)){ showMsg('この配置からは解けません', true); return res(null); }
    const a=WarehouseEngine.analyse(puzzle.grid, puzzle.w, goals, table,
      {boxes:boxes.slice().sort((x,y)=>x-y), rep:reg.rep, cells:reg.cells},
      WarehouseEngine.mulberry32(1), WarehouseEngine.greedyPolicies(puzzle.grid, puzzle.w, goals));
    dist=table;
    if(!a){ showMsg('解けますが、手応えを測れませんでした'); return res(null); }
    showMsg('解けます。最短'+a.pushes+'手 / 罠率'+Math.round(a.trapRatio*100)+'%'
      +' / 素直に詰む'+a.greedyDied+'/3 / 一本道'+a.forced+(a.offGoal?' / 置き場からどける':''));
    res(a);
  },0));
}
function editReset(){
  if(editOrigin===null){ showMsg('まだ編集していません'); return; }
  puzzle=parseBoard(editOrigin);
  goalSet=new Set(puzzle.goals);
  boxes=puzzle.boxes.slice(); player=puzzle.player;
  editOrigin=null; editDirty=false; dist=null;
  buildBoard(); layoutBoard(); hideMsg();
}
async function editExport(){
  const a=await editCheck();
  if(!a) return;
  const item={
    b: boardToXSB(), at: index+1, p: a.pushes,
    tr: Math.round(a.trapRatio*100), f: a.forced, g: a.greedyDied, og: a.offGoal?1:0,
    note: '第'+(index+1)+'面を編集',
  };
  const url=URL.createObjectURL(new Blob([JSON.stringify([item],null,1)], {type:'application/json'}));
  const el=document.createElement('a');
  el.href=url; el.download='edited-level.json';
  document.body.appendChild(el); el.click(); el.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
  showMsg('edited-level.json に書き出しました（最短'+a.pushes+'手）');
}

/* ================= 入力 ================= */
const KEYMAP={
  ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
  w:'up', s:'down', a:'left', d:'right', W:'up', S:'down', A:'left', D:'right',
};
document.addEventListener('keydown',e=>{
  // クリア画面が出ているときは Enter で次へ
  if($('pickOverlay').classList.contains('show')) return;   // 面選択中は盤を操作しない
  if(e.key==='Enter'){
    if($('rulesOverlay').classList.contains('show')){ e.preventDefault(); $('rulesOverlay').classList.remove('show'); return; }
    if($('overlay').classList.contains('show')){ e.preventDefault(); nextStage(); }
    return;
  }
  if(DEBUG&&(e.key==='z'||e.key==='Z')){ undo(); return; }
  const dir=KEYMAP[e.key];
  if(!dir) return;
  e.preventDefault();
  flashKey(dir);            // 押しっぱなしの間は点いたまま(押すたびに寿命が延びる)
  move(dir);
});
document.querySelectorAll('.dpad button[data-dir]').forEach(b=>{
  b.addEventListener('click',()=>{ flashKey(b.dataset.dir); move(b.dataset.dir); });
});
// スワイプは画面のどこでも受け付ける。ページごとスクロールしないよう既定の動作を止める。
// ただしボタン類とモーダルの上では、押せなくなってしまうので受け付けない
let tsx=0, tsy=0, swiped=false, tracking=false, tapDir=null, tapLabel=false, tapTitle=false;

// 「ステージ」の文字を5回つづけて叩くとデバッグ表示を切り替える(クエリが使えない場所むけ)
let debugTaps=0, debugTapAt=0;
function bumpDebugTap(){
  const now=Date.now();
  debugTaps = (now-debugTapAt<1200) ? debugTaps+1 : 1;   // 800だと取りこぼしやすい
  debugTapAt=now;
  if(debugTaps<5) return;
  debugTaps=0;
  try{ localStorage.setItem('warehouse-debug', DEBUG?'0':'1'); }catch(e){}
  const u=new URL(location.href);
  u.searchParams.delete('debug');            // 保存値が効くよう、指定は消して読み直す
  location.href=u.pathname+(u.search||'');
}
document.querySelector('.stagelabel').addEventListener('click',bumpDebugTap);

// 表題を5回つづけて叩くと最新に取り直す。ホーム画面のアプリはキャッシュが頑固で、
// 画面のスワイプはゲームの操作に使っているので下に引っぱっての更新もできない
let freshTaps=0, freshTapAt=0;
function bumpFreshTap(){
  const now=Date.now();
  freshTaps = (now-freshTapAt<1200) ? freshTaps+1 : 1;
  freshTapAt=now;
  if(freshTaps<5) return;
  freshTaps=0;
  forceFresh();
}
function forceFresh(){
  const u=new URL(location.href);
  u.searchParams.set('fresh', String(Date.now()));
  location.replace(u.pathname+u.search);
}
document.querySelector('header h1').addEventListener('click',bumpFreshTap);
const swipeBlocked=t=>{
  if(!(t instanceof Element)) return false;
  if(EDIT && t.closest('.board')) return true;          // 編集中の盤はタップで塗る
  if(EDIT && t.closest('.palette')) return true;
  if(t.closest('.dpad button[data-dir]')) return false;   // 十字キーの上でもスワイプできる
  if(t.closest('button,a,input,select,textarea,label')) return true;
  if(t.closest('.overlay.show')) return true;
  return false;
};
document.addEventListener('touchstart',e=>{
  tracking=!swipeBlocked(e.target);
  if(!tracking) return;
  // 十字キーの上で始まった場合、動かさずに離したら「押した」ことにする
  const key=e.target instanceof Element ? e.target.closest('.dpad button[data-dir]') : null;
  tapDir=key ? key.dataset.dir : null;
  tapLabel=e.target instanceof Element && !!e.target.closest('.stagelabel');
  tapTitle=e.target instanceof Element && !!e.target.closest('header h1');
  const t=e.changedTouches[0]; tsx=t.clientX; tsy=t.clientY; swiped=false;
  e.preventDefault();
},{passive:false});
/* フリックで動かしたとき、対応する十字キーを一瞬光らせてから動かす。
   壁でも光らせる。どちらへ弾いたかが伝わることのほうが大事 */
let litTimer=null;
function flashKey(dir){
  const b=document.querySelector('.dpad button[data-dir="'+dir+'"]');
  if(!b) return;
  document.querySelectorAll('.dpad button.lit').forEach(x=>x.classList.remove('lit'));
  b.classList.add('lit');
  clearTimeout(litTimer);
  litTimer=setTimeout(()=>b.classList.remove('lit'), 120);
}
const swipeDir=(dx,dy)=>Math.abs(dx)>Math.abs(dy) ? (dx>0?'right':'left') : (dy>0?'down':'up');
function swipeMove(dx,dy){ const d=swipeDir(dx,dy); flashKey(d); move(d); }

document.addEventListener('touchmove',e=>{
  if(!tracking) return;
  e.preventDefault();
  if(swiped) return;
  const t=e.changedTouches[0];
  const dx=t.clientX-tsx, dy=t.clientY-tsy;
  if(Math.abs(dx)<20&&Math.abs(dy)<20) return;
  swiped=true;
  document.body.classList.add('swiping');    // 指の下のキーの光りを止める
  swipeMove(dx,dy);
},{passive:false});
document.addEventListener('touchend',e=>{
  if(!tracking) return;
  tracking=false;
  document.body.classList.remove('swiping');
  e.preventDefault();
  if(swiped) return;
  const t=e.changedTouches[0];
  const dx=t.clientX-tsx, dy=t.clientY-tsy;
  if(Math.abs(dx)<12&&Math.abs(dy)<12){
    if(tapDir){ flashKey(tapDir); move(tapDir); }
    else if(tapLabel) bumpDebugTap();
    else if(tapTitle) bumpFreshTap();
    return;
  }
  swipeMove(dx,dy);
},{passive:false});
document.addEventListener('touchcancel',()=>{ tracking=false; document.body.classList.remove('swiping'); });

/* ================= ボタン ================= */
$('btnDpadMode').addEventListener('click',()=>{
  dpadMode=DPAD_MODES[(DPAD_MODES.indexOf(dpadMode)+1)%DPAD_MODES.length];
  applyDpadMode();
});
$('btnRules').addEventListener('click',()=>$('rulesOverlay').classList.add('show'));
$('btnRulesClose').addEventListener('click',()=>$('rulesOverlay').classList.remove('show'));
$('btnReset').addEventListener('click',resetLevel);
// 端末に残った進行と★を消す(iPhone だと設定アプリからでないと消せないため)
$('btnWipe').addEventListener('click',()=>{
  const n=clearedCount(), f=Object.keys(favs).length, b=Object.keys(bads).length;
  if(!confirm('クリア記録 '+n+'面 / ★ '+f+'面 / ✕ '+b+'面 を消します。よろしいですか？')) return;
  progress={v:1, cleared:{}};
  favs={}; bads={};
  saveProgress(); saveFavs(); saveBads();
  updateStats(); updateFavButton(); updateBadButton();
  showMsg('記録を消しました。');
});
// 端末を替えたり、ホーム画面のアプリを入れ直したりして進行が消えたときの復旧用。
// 自己ベストは 999手 にしておく。実際に解けば必ず更新される
$('btnMark').addEventListener('click',()=>{
  const cur=index+1;
  const a=prompt('第何面まで進んだことにしますか？（1〜'+LEVELS.length+'）', String(cur));
  if(a===null) return;
  const n=Math.max(0, Math.min(LEVELS.length, Math.floor(+a)));
  if(!(n>=0)){ alert('数字を入れてください。'); return; }
  let add=0;
  for(let i=0;i<n;i++){
    const lv=LEVELS[i];
    if(progress.cleared[lv.id]===undefined){ progress.cleared[lv.id]=999; add++; }
  }
  saveProgress(); updateStats();
  showMsg('第'+n+'面までクリア済みにしました。（'+add+'面ぶん追加、自己ベストは未記録）');
});
// ホーム画面のアプリはキャッシュが頑固で、下に引っぱっての更新もできない
// (画面のスワイプはゲームの操作に使っているため)。ここから取り直す
$('btnFresh').addEventListener('click',forceFresh);
// 音が出ないときの切り分け。2つの経路で大きめの音を鳴らし、結果をそのまま出す
$('btnSoundTest').addEventListener('click',()=>{
  pokeMedia();
  ensureAudio(true);
  const out=[];
  out.push('箱:'+(!AC?'非対応':!actx?'未作成':actx.state));
  try{
    if(actx && actx.state==='running'){
      const t=actx.currentTime, o=actx.createOscillator(), g=actx.createGain();
      o.type='square'; o.frequency.value=440;
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.6);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t+0.6);
      out.push('WebAudio:鳴らした');
    }else out.push('WebAudio:止まっている');
  }catch(e){ out.push('WebAudio:'+(e&&e.name||e)); }
  try{
    const a=new Audio(toneWav(440,0.6,'square',0.25));
    a.volume=1;
    const p=a.play();
    if(p&&p.then) p.then(()=>showMsg(out.concat('波形:鳴らした','消音スイッチが入っていれば、どちらも鳴りません').join(' / ')))
                   .catch(e=>showMsg(out.concat('波形:'+(e&&e.name||e)).join(' / '), true));
    else out.push('波形:たぶん鳴らした');
  }catch(e){ out.push('波形:'+(e&&e.name||e)); }
  showMsg(out.join(' / '));
});
$('btnBad').addEventListener('click',toggleBad);
$('btnBadWin').addEventListener('click',toggleBad);
$('btnBadExport').addEventListener('click',exportBads);
$('btnEffort').addEventListener('click',exportEfforts);

/* ルール版の出入り。いまは夏(水)だけ。デバッグ表示のときにしか押せない。
   住所を付け替えて開き直すだけにして、状態を持ち回らない */
$('btnPack').textContent = PACK ? ('本編へもどる (いま'+PACKS[PACK].label+')') : 'ルール版：夏・水';
$('btnPack').addEventListener('click',()=>{
  const u=new URL(location.href);
  u.searchParams.delete('lv');               // 面の指定は持ち越さない
  if(PACK) u.searchParams.delete('pack');
  else u.searchParams.set('pack','summer');
  location.href=u.pathname+(u.search||'');
});

/* ================= 引っ越しの画面 ================= */
function spellUrl(){
  return location.origin + location.pathname.replace(/[^/]*$/,'') + '?move=' + makeSpell();
}
function openMove(){
  const n=Object.keys(progress.cleared).length;
  const url=spellUrl();
  $('moveSum').textContent = n ? ('クリアした'+n+'面ぶんの記録を持っていけます') : 'まだクリアした面がありません';
  $('moveUrl').value=url;
  $('movePasteBox').value='';
  $('moveOverlay').classList.add('show');
}
function closeMove(){ $('moveOverlay').classList.remove('show'); }
async function copyMove(){
  const url=$('moveUrl').value;
  try{ await navigator.clipboard.writeText(url); showMsg('リンクをコピーしました'); }
  catch(e){ $('moveUrl').select(); showMsg('長押しして「コピー」を選んでください'); }
}
function pasteMove(){
  const s=$('movePasteBox').value;
  if(!s.trim()){ showMsg('貼り付ける欄が空です'); return; }
  // リンクごと貼られても拾えるように
  const m=/[?&]move=([A-Za-z0-9_-]+)/.exec(s);
  if(takeSpell(m?m[1]:s.trim(), true)) $('movePasteBox').value='';
}
/* 引っ越しデータを入れる。黙って上書きしない。何面ぶん増えるかを見せて聞く */
function takeSpell(code, fromPaste){
  const res=readSpell(code);
  if(res.err){ alert('入れられませんでした。\n\n'+res.err); return false; }
  const n=Object.keys(progress.cleared).length;
  if(!confirm(`受け取ったデータには ${res.count}面ぶんの記録があります。\n`
    +`いまのこの端末は ${n}面です。\n\n`
    +`この端末に入れますか？\n`
    +`いまの記録は消えません。同じ面は、手数の少ないほうが残ります。`)) return false;
  const r=applySpell(res);
  if(res.skin && res.skin!==skinName){ try{ localStorage.setItem('warehouse-skin', res.skin); }catch(e){} }
  if(res.dpad && res.dpad!==dpadMode){ dpadMode=res.dpad; store.set('dpad', dpadMode); applyDpadMode(); }
  updateStats(); updateNav && NAV && updateNav();
  alert(`入れました。\n\n新しく増えた面: ${r.added}\n手数が縮んだ面: ${r.better}\n変わらなかった面: ${r.same}`
    + (r.eAdded ? `\n解いたときの記録: ${r.eAdded}面ぶん` : '')
    + (res.skin!==skinName ? '\n\n見た目は、次に開いたときから変わります' : ''));
  if(fromPaste) closeMove();
  return true;
}
$('btnMoveOpen').addEventListener('click',openMove);
$('btnMoveClose').addEventListener('click',closeMove);
$('btnMoveCopy').addEventListener('click',copyMove);
$('btnMovePaste').addEventListener('click',pasteMove);
$('moveOverlay').addEventListener('click',e=>{ if(e.target===$('moveOverlay')) closeMove(); });

/* ?move=… で開かれたときの取り込み。面が揃ってから、始める面を決める前に呼ぶ。
   URL からは必ず消す。残すと、再読込のたびに同じことを聞かれる */
function takeMoveFromUrl(){
  const code=QS.get('move');
  if(!code) return;
  try{ takeSpell(code, false); }catch(e){ alert('入れられませんでした。\n\n'+e.message); }
  try{
    const u=new URL(location.href); u.searchParams.delete('move');
    history.replaceState(null,'', u.pathname+(u.search||''));
  }catch(e){}
}
$('btnBadWipe').addEventListener('click',wipeMarks);
$('btnCheck').addEventListener('click',editCheck);
$('btnEditReset').addEventListener('click',editReset);
$('btnEditExport').addEventListener('click',editExport);
document.querySelectorAll('.palette button').forEach(b=>{
  b.addEventListener('click',()=>selectTool(b.dataset.tool));
});
if(EDIT){
  selectTool('wall');
  boardEl.addEventListener('click',e=>{
    const cell=e.target.closest('.cell');
    if(!cell) return;
    const i=cellEls.indexOf(cell);
    if(i>=0) editCell(i);
  });
}
$('btnFav').addEventListener('click',()=>toggleFav(false));
$('btnFavWin').addEventListener('click',()=>toggleFav(true));
$('btnExport').addEventListener('click',exportFavs);
$('favRange').addEventListener('input',e=>{
  $('favVal').textContent=e.target.value;
  if(puzzle&&favs[puzzle.meta.id]) saveFav(e.target.value);   // 決定ボタンはないので即座に記録
});
$('favSkip').addEventListener('click',skipFavPlace);
$('btnShare').addEventListener('click',()=>{ if(shareData) shareLink(shareData.url, shareData.text); });
$('btnNextStage').addEventListener('click',nextStage);
$('btnUndo').addEventListener('click',undo);
$('btnHint').addEventListener('click',hint);
$('btnPick').addEventListener('click',openPicker);
$('btnPickClose').addEventListener('click',()=>$('pickOverlay').classList.remove('show'));
$('btnHist').addEventListener('click',openHist);
if(COOP_ON) $('btnCo').addEventListener('click',()=>{ if(coop) coQuit(); else coStart(); });
else { $('btnCo').style.display='none'; $('btnCoSend').style.display='none'; }
$('btnCoSend').addEventListener('click',coSend);
$('btnHistFilter').addEventListener('click',()=>{ histOnlyLeft=!histOnlyLeft; renderHist(); });
$('btnHistClose').addEventListener('click',()=>$('histOverlay').classList.remove('show'));
$('btnHistExit').addEventListener('click',exitReplay);
$('btnPrev').addEventListener('click',()=>startLevel(index-1));
$('btnNext').addEventListener('click',()=>startLevel(index+1));

// 全局面の表が要る機能(ヒント・詰み表示)は、ふつうのルールでしか正しく動かない
if(RULE!=='plain') document.body.classList.add('no-table');

// 見た目だけの入れ替え。絵文字を直に書いてあるところを、まとめて置き換える
if(skinName!=='normal'){
  document.body.classList.add('skin-'+skinName);
  // ホーム画面に追加するとき、iOS はそのときの DOM を見る。
  // 追加ずみのアイコンは変わらない(入れ直しが要る)
  document.querySelector('link[rel="apple-touch-icon"]').href=ASSET+'icon-180'+SKIN.icon+'.png';
  document.querySelector('link[rel="icon"]').href=ASSET+'icon-512'+SKIN.icon+'.png';
  // ルール違いは独立したゲームなので、題はその頁のものを使う
  if(!PACK){
    document.querySelector('meta[name="apple-mobile-web-app-title"]').content=SKIN.title;
    document.title=SKIN.title;
  }
  document.querySelector('.loading .spin').textContent=SKIN.box;
  document.querySelector('.win-emoji').textContent=SKIN.box+'🎉'+SKIN.man;
  document.querySelector('.palette button[data-tool="man"]').textContent=SKIN.man;
  const rules=document.querySelector('.rules');
  rules.innerHTML=rules.innerHTML.split('🐥').join(SKIN.man).split('📦').join(SKIN.box);
}
// デバッグバーのボタンは、押すたびに次の着せ替えへ回る
$('btnSkin').textContent='見た目：'+SKIN.label;
$('btnSkin').addEventListener('click',()=>{
  const next=SKIN_ORDER[(SKIN_ORDER.indexOf(skinName)+1)%SKIN_ORDER.length];
  try{ localStorage.setItem('warehouse-skin', next); }catch(e){}
  const u=new URL(location.href);
  u.searchParams.delete('skin');              // 保存値が効くよう、指定は消して読み直す
  u.searchParams.delete('beetle');
  location.href=u.pathname+(u.search||'');
});

applyDpadMode();
