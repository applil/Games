'use strict';
/* PNG の左上から指定サイズを切り出す小さな道具。
 *
 *   node tools/crop-png.js <入力> <出力> <幅> <高さ>
 *
 * ヘッドレスの撮影はウィンドウ全体の大きさになり、表示領域の外は白のまま残る。
 * 画像を扱う道具がこの環境に無いので、必要な最小限だけ自前で書く。
 * 対応するのは 8bit の RGB / RGBA、インターレース無しのみ。
 */
const fs=require('fs');
const zlib=require('zlib');

const CRC=(()=>{
  const t=new Int32Array(256);
  for(let n=0;n<256;n++){ let c=n;
    for(let k=0;k<8;k++) c = (c&1) ? (0xEDB88320 ^ (c>>>1)) : (c>>>1);
    t[n]=c; }
  return buf=>{ let c=0xFFFFFFFF;
    for(let i=0;i<buf.length;i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c>>>8);
    return (c ^ 0xFFFFFFFF)>>>0; };
})();

function chunks(buf){
  const out=[];
  let p=8;                                  // 署名の8バイトを飛ばす
  while(p<buf.length){
    const len=buf.readUInt32BE(p);
    const type=buf.toString('ascii', p+4, p+8);
    out.push({type, data:buf.slice(p+8, p+8+len)});
    p += 12+len;
  }
  return out;
}
function chunk(type, data){
  const out=Buffer.alloc(12+data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(CRC(out.slice(4, 8+data.length)), 8+data.length);
  return out;
}

// PNG を {w,h,bpp,color,px} に開く。px はフィルタを外した生の画素
function decode(src){
  const cs=chunks(src);
  const ihdr=cs.find(c=>c.type==='IHDR').data;
  const w=ihdr.readUInt32BE(0), h=ihdr.readUInt32BE(4);
  const depth=ihdr[8], color=ihdr[9], interlace=ihdr[12];
  if(depth!==8 || (color!==6 && color!==2) || interlace!==0)
    throw new Error('この形式には未対応です (深さ'+depth+' 色種別'+color+' インターレース'+interlace+')');
  const bpp = color===6 ? 4 : 3;
  const stride = w*bpp;

  const idat=Buffer.concat(cs.filter(c=>c.type==='IDAT').map(c=>c.data));
  const raw=zlib.inflateSync(idat);

  // フィルタを外して生の画素に戻す
  const px=Buffer.alloc(h*stride);
  let p=0;
  for(let y=0;y<h;y++){
    const f=raw[p++];
    const line=raw.slice(p, p+stride); p+=stride;
    const cur=px.slice(y*stride, (y+1)*stride);
    const prev = y? px.slice((y-1)*stride, y*stride) : Buffer.alloc(stride);
    for(let x=0;x<stride;x++){
      const a = x>=bpp ? cur[x-bpp] : 0;
      const b = prev[x];
      const c = x>=bpp ? prev[x-bpp] : 0;
      let v=line[x];
      if(f===1) v+=a;
      else if(f===2) v+=b;
      else if(f===3) v+=(a+b)>>1;
      else if(f===4){
        const pp=a+b-c, pa=Math.abs(pp-a), pb=Math.abs(pp-b), pc=Math.abs(pp-c);
        v += (pa<=pb&&pa<=pc) ? a : (pb<=pc ? b : c);
      }
      cur[x]=v&0xFF;
    }
  }
  return {w, h, bpp, color, px};
}

// 生の画素を、フィルタ無しの PNG に戻す
function encode(w, h, bpp, px){
  const color = bpp===4 ? 6 : 2;
  const stride=w*bpp;
  const raw=Buffer.alloc(h*(1+stride));
  for(let y=0;y<h;y++){
    raw[y*(1+stride)]=0;
    px.copy(raw, y*(1+stride)+1, y*stride, (y+1)*stride);
  }
  const nh=Buffer.alloc(13);
  nh.writeUInt32BE(w,0); nh.writeUInt32BE(h,4);
  nh[8]=8; nh[9]=color; nh[10]=0; nh[11]=0; nh[12]=0;
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    chunk('IHDR', nh),
    chunk('IDAT', zlib.deflateSync(raw, {level:9})),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crop(src, cw, ch){
  const {w, h, bpp, px}=decode(src);
  if(cw>w||ch>h) throw new Error('切り出す大きさが元より大きいです');
  const stride=w*bpp;
  const out=Buffer.alloc(ch*cw*bpp);
  for(let y=0;y<ch;y++) px.copy(out, y*cw*bpp, y*stride, y*stride+cw*bpp);
  return encode(cw, ch, bpp, out);
}

module.exports={crop, decode, encode};

if(require.main===module){
  const [,,inp,outp,W,H]=process.argv;
  if(!inp||!outp||!W||!H){ console.error('使い方: node tools/crop-png.js <入力> <出力> <幅> <高さ>'); process.exit(1); }
  const out=crop(fs.readFileSync(inp), +W, +H);
  fs.writeFileSync(outp, out);
  console.log(outp+' に '+W+'x'+H+' で書き出しました ('+out.length+'バイト)');
}
