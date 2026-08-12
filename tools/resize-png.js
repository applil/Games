'use strict';
/* PNG を縮小して、透明部分を背景色で塗りつぶす道具。
 *
 *   node tools/resize-png.js <入力> <出力> <一辺> [背景色]
 *
 * ホーム画面のアイコンは透明を許さないので、必ず不透明にして出す。
 * 縮小は面積平均。元の1画素が出力の複数画素にまたがる分も重みで配る。
 * この環境には画像の道具が無いので、必要な最小限だけ自前で書く。
 */
const fs=require('fs');
const path=require('path');
const {decode, encode}=require(path.join(__dirname,'crop-png.js'));

function hex(s){
  const m=/^#?([0-9a-f]{6})$/i.exec(s||'');
  if(!m) throw new Error('背景色は #rrggbb で指定してください: '+s);
  const v=parseInt(m[1],16);
  return [(v>>16)&255, (v>>8)&255, v&255];
}

// 面積平均で縮小し、同時に背景色に重ねる
function resize(src, W, H, bg){
  const {w, h, bpp, px}=decode(src);
  const acc=new Float64Array(W*H*3);
  const wsum=new Float64Array(W*H);
  const sx=W/w, sy=H/h;
  for(let y=0;y<h;y++){
    const y0=y*sy, y1=y0+sy;
    for(let x=0;x<w;x++){
      const i=(y*w+x)*bpp;
      const a = bpp===4 ? px[i+3]/255 : 1;
      // 先に背景に重ねてから混ぜる。透明な画素の色は当てにならない
      const r=px[i]*a + bg[0]*(1-a);
      const g=px[i+1]*a + bg[1]*(1-a);
      const b=px[i+2]*a + bg[2]*(1-a);
      const x0=x*sx, x1=x0+sx;
      for(let oy=Math.floor(y0); oy<Math.min(H, Math.ceil(y1)); oy++){
        const ov=Math.min(y1,oy+1)-Math.max(y0,oy);
        if(ov<=0) continue;
        for(let ox=Math.floor(x0); ox<Math.min(W, Math.ceil(x1)); ox++){
          const oh=Math.min(x1,ox+1)-Math.max(x0,ox);
          if(oh<=0) continue;
          const k=oy*W+ox, wt=ov*oh;
          acc[k*3]+=r*wt; acc[k*3+1]+=g*wt; acc[k*3+2]+=b*wt;
          wsum[k]+=wt;
        }
      }
    }
  }
  const out=Buffer.alloc(W*H*3);
  for(let k=0;k<W*H;k++){
    const s=wsum[k]||1;
    for(let c=0;c<3;c++) out[k*3+c]=Math.max(0, Math.min(255, Math.round(acc[k*3+c]/s)));
  }
  return encode(W, H, 3, out);
}

module.exports={resize};

if(require.main===module){
  const [,,inp,outp,SIZE,BG]=process.argv;
  if(!inp||!outp||!SIZE){
    console.error('使い方: node tools/resize-png.js <入力> <出力> <一辺> [背景色]');
    process.exit(1);
  }
  const n=+SIZE;
  const out=resize(fs.readFileSync(inp), n, n, hex(BG||'#eef2f9'));
  fs.writeFileSync(outp, out);
  console.log(outp+' に '+n+'x'+n+' で書き出しました ('+out.length+'バイト)');
}
