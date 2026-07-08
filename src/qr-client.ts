// Browser-side QR generator, delivered as a JS source string that is injected
// into the createPage <script>. Byte mode, versions 1..10, dependency-free —
// no external CDN/API. Produces an inline SVG string from a URL.
//
// It defines a global function `utakataQrSvg(text, pxSize)` in the page.

export const qrClientScript = String.raw`
(function(){
  var EXP = new Uint8Array(256), LOG = new Uint8Array(256);
  (function(){ var x=1; for(var i=0;i<255;i++){ EXP[i]=x; LOG[x]=i; x<<=1; if(x&0x100) x^=0x11d; } for(var j=255;j<256;j++) EXP[j]=EXP[j-255]; })();
  function gfMul(a,b){ if(a===0||b===0) return 0; return EXP[(LOG[a]+LOG[b])%255]; }
  // Generator polynomial of degree 'deg', coefficients high..low, monic.
  function rsGen(deg){ var poly=[1]; for(var i=0;i<deg;i++){ var next=new Array(poly.length+1).fill(0); for(var j=0;j<poly.length;j++){ next[j]^=poly[j]; next[j+1]^=gfMul(poly[j],EXP[i]); } poly=next; } return poly; }
  function rsEncode(data,ecCount){ var gen=rsGen(ecCount); var res=new Array(ecCount).fill(0); for(var k=0;k<data.length;k++){ var factor=data[k]^res[0]; res.shift(); res.push(0); for(var i=0;i<ecCount;i++) res[i]^=gfMul(gen[i+1],factor); } return res; }

  var EC={ "1M":[10,1,16,0,0],"2M":[16,1,28,0,0],"3M":[26,1,44,0,0],"4M":[18,2,32,0,0],"5M":[24,2,43,0,0],"6M":[16,4,27,0,0],"7M":[18,4,31,0,0],"8M":[22,2,38,2,39],"9M":[22,3,36,2,37],"10M":[26,4,43,1,44] };
  var ALIGN=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];

  function totalData(v){ var t=EC[v+"M"]; return t[1]*t[2]+t[3]*t[4]; }
  // Cap at version 6: versions >=7 require version-info modules which this
  // minimal encoder does not emit. utakata URLs are ~56 chars => version 4.
  function chooseVersion(len){ for(var v=1;v<=6;v++){ var cap=totalData(v); if(1+1+len+1<=cap) return v; } throw new Error("too long"); }

  function buildData(bytes,v){
    var cap=totalData(v); var bits=[];
    function push(val,l){ for(var i=l-1;i>=0;i--) bits.push((val>>i)&1); }
    push(4,4); var cb=v<=9?8:16; push(bytes.length,cb);
    for(var i=0;i<bytes.length;i++) push(bytes[i],8);
    var total=cap*8; var term=Math.min(4,total-bits.length); for(var t=0;t<term;t++) bits.push(0);
    while(bits.length%8!==0) bits.push(0);
    var cw=[]; for(var b=0;b<bits.length;b+=8){ var by=0; for(var j=0;j<8;j++) by=(by<<1)|bits[b+j]; cw.push(by); }
    var pads=[0xec,0x11],pi=0; while(cw.length<cap) cw.push(pads[pi++%2]); return cw;
  }
  function assemble(dataCw,v){
    var t=EC[v+"M"]; var ecPer=t[0],b1=t[1],d1=t[2],b2=t[3],d2=t[4]; var blocks=[]; var idx=0;
    for(var i=0;i<b1;i++){ var d=dataCw.slice(idx,idx+d1); idx+=d1; blocks.push({data:d,ec:rsEncode(d,ecPer)}); }
    for(var i2=0;i2<b2;i2++){ var d2a=dataCw.slice(idx,idx+d2); idx+=d2; blocks.push({data:d2a,ec:rsEncode(d2a,ecPer)}); }
    var res=[]; var maxD=Math.max(d1,d2);
    for(var c=0;c<maxD;c++) for(var bl=0;bl<blocks.length;bl++) if(c<blocks[bl].data.length) res.push(blocks[bl].data[c]);
    for(var e=0;e<ecPer;e++) for(var bl2=0;bl2<blocks.length;bl2++) res.push(blocks[bl2].ec[e]);
    return res;
  }
  function makeGrid(size){ var g=[]; for(var i=0;i<size;i++){ g.push(new Array(size).fill(null)); } return g; }
  function finder(g,r,c){ for(var dr=-1;dr<=7;dr++) for(var dc=-1;dc<=7;dc++){ var rr=r+dr,cc=c+dc; if(rr<0||cc<0||rr>=g.length||cc>=g.length) continue; var ring=(dr>=0&&dr<=6&&(dc===0||dc===6))||(dc>=0&&dc<=6&&(dr===0||dr===6)); var ctr=dr>=2&&dr<=4&&dc>=2&&dc<=4; g[rr][cc]=(ring||ctr)?1:0; } }
  function alignment(g,v){ var pos=ALIGN[v-1]; for(var a=0;a<pos.length;a++) for(var b=0;b<pos.length;b++){ var r=pos[a],c=pos[b]; if(g[r][c]!==null) continue; for(var dr=-2;dr<=2;dr++) for(var dc=-2;dc<=2;dc++){ var ring=Math.max(Math.abs(dr),Math.abs(dc)); g[r+dr][c+dc]=ring===1?0:1; } } }
  function timing(g){ var size=g.length; for(var i=8;i<size-8;i++){ var v=i%2===0?1:0; if(g[6][i]===null) g[6][i]=v; if(g[i][6]===null) g[i][6]=v; } }
  var EC_FMT={M:0};
  function formatBits(mask){ var data=(EC_FMT.M<<3)|mask; var d=data<<10; var gpoly=0x537; for(var i=4;i>=0;i--){ if(d&(1<<(i+10))) d^=gpoly<<i; } return ((data<<10)|d)^0x5412; }
  function placeFormat(g,mask){ var size=g.length; var bits=formatBits(mask); function get(i){ return (bits>>i)&1; }
    // Top-left: bits 0..5 down column 8, then corner, then bits 9..14 along row 8
    for(var i=0;i<=5;i++) g[i][8]=get(i); g[7][8]=get(6); g[8][8]=get(7); g[8][7]=get(8);
    for(var j=9;j<=14;j++) g[8][14-j]=get(j);
    // Bottom-left (down col 8) bits 0..7, top-right (along row 8) bits 8..14
    for(var k=0;k<=6;k++) g[8][size-1-k]=get(k);
    for(var m=7;m<=14;m++) g[size-15+m][8]=get(m);
  }
  function maskFn(r,c){ return (r+c)%2===0; } // mask 0
  function funcMask(v,size){ var m=[]; for(var i=0;i<size;i++) m.push(new Array(size).fill(false));
    function mk(r,c){ if(r>=0&&c>=0&&r<size&&c<size) m[r][c]=true; }
    var fs=[[0,0],[0,size-7],[size-7,0]];
    for(var f=0;f<fs.length;f++){ for(var dr=-1;dr<=7;dr++) for(var dc=-1;dc<=7;dc++) mk(fs[f][0]+dr,fs[f][1]+dc); }
    for(var i2=0;i2<size;i2++){ mk(6,i2); mk(i2,6); }
    var pos=ALIGN[v-1];
    for(var a=0;a<pos.length;a++) for(var b=0;b<pos.length;b++){ var r=pos[a],c=pos[b]; var nf=(r<=8&&c<=8)||(r<=8&&c>=size-9)||(r>=size-9&&c<=8); if(nf) continue; for(var dr2=-2;dr2<=2;dr2++) for(var dc2=-2;dc2<=2;dc2++) mk(r+dr2,c+dc2); }
    for(var q=0;q<=8;q++){ mk(8,q); mk(q,8); }
    for(var w=0;w<8;w++){ mk(8,size-1-w); mk(size-1-w,8); }
    mk(size-8,8);
    return m;
  }
  function placeData(g,fm,cw){ var size=g.length; var bits=[]; for(var i=0;i<cw.length;i++) for(var j=7;j>=0;j--) bits.push((cw[i]>>j)&1); var bi=0; var up=true;
    for(var col=size-1;col>0;col-=2){ if(col===6) col--; for(var i2=0;i2<size;i2++){ var row=up?size-1-i2:i2; for(var cc=0;cc<2;cc++){ var c=col-cc; if(fm[row][c]) continue; var bit=bi<bits.length?bits[bi++]:0; if(maskFn(row,c)) bit^=1; g[row][c]=bit; } } up=!up; }
  }
  window.utakataQrSvg=function(text,pxSize){
    pxSize=pxSize||180;
    var bytes=Array.from(new TextEncoder().encode(text));
    var v=chooseVersion(bytes.length); var size=17+v*4;
    var dataCw=buildData(bytes,v); var cw=assemble(dataCw,v);
    var fm=funcMask(v,size); var g=makeGrid(size);
    finder(g,0,0); finder(g,0,size-7); finder(g,size-7,0);
    alignment(g,v); timing(g); g[size-8][8]=1;
    placeData(g,fm,cw); placeFormat(g,0);
    var quiet=4; var dim=size+quiet*2; var scale=pxSize/dim; var rects="";
    for(var r=0;r<size;r++) for(var c=0;c<size;c++){ if(g[r][c]===1){ var x=((c+quiet)*scale).toFixed(2); var y=((r+quiet)*scale).toFixed(2); var s=scale.toFixed(2); rects+='<rect x="'+x+'" y="'+y+'" width="'+s+'" height="'+s+'"/>'; } }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="'+pxSize+'" height="'+pxSize+'" viewBox="0 0 '+pxSize+' '+pxSize+'" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="'+pxSize+'" height="'+pxSize+'" fill="#fff"/><g fill="#3b4252">'+rects+'</g></svg>';
  };
})();
`;
