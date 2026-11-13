import fs from 'fs'; import zlib from 'zlib';
const B={w:-45.331,e:-45.289,s:-23.239,n:-23.205}, Z=14, NX=220, NY=200;
const lon2x=l=>(l+180)/360*2**Z, lat2y=l=>{const r=l*Math.PI/180;return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*2**Z};
function decode(buf){let p=8,idat=[],W,H,bd,ct;while(p<buf.length){const len=buf.readUInt32BE(p),type=buf.toString('latin1',p+4,p+8),d=buf.subarray(p+8,p+8+len);if(type==='IHDR'){W=d.readUInt32BE(0);H=d.readUInt32BE(4);bd=d[8];ct=d[9];if(d[12])throw new Error('interlaced')}if(type==='IDAT')idat.push(d);p+=12+len}
 if(bd!==8||(ct!==2&&ct!==6))throw new Error('fmt '+bd+' '+ct);const bpp=ct===2?3:4,raw=zlib.inflateSync(Buffer.concat(idat)),st=W*bpp,out=Buffer.alloc(H*st);
 for(let y=0;y<H;y++){const f=raw[y*(st+1)];for(let i=0;i<st;i++){const x=raw[y*(st+1)+1+i],a=i>=bpp?out[y*st+i-bpp]:0,b=y?out[(y-1)*st+i]:0,c=(y&&i>=bpp)?out[(y-1)*st+i-bpp]:0;let v;
  if(f===0)v=x;else if(f===1)v=x+a;else if(f===2)v=x+b;else if(f===3)v=x+((a+b)>>1);else{const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);v=x+(pa<=pb&&pa<=pc?a:pb<=pc?b:c)}out[y*st+i]=v&255}}
 return{W,H,bpp,out}}
const tiles={};
async function tile(x,y){const k=x+'/'+y;if(!tiles[k]){const r=await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`);if(!r.ok)throw new Error('tile '+r.status);tiles[k]=decode(Buffer.from(await r.arrayBuffer()));console.log('tile',k)}return tiles[k]}
async function px(fx,fy){const tx=Math.floor(fx),ty=Math.floor(fy),t=await tile(tx,ty);const i=Math.min(t.W-1,Math.floor((fx-tx)*t.W)),j=Math.min(t.H-1,Math.floor((fy-ty)*t.H)),o=(j*t.W+i)*t.bpp;return t.out[o]*256+t.out[o+1]+t.out[o+2]/256-32768}
async function h(lon,lat){ // bilinear in pixel space
 const X=lon2x(lon)*256-0.5,Y=lat2y(lat)*256-0.5,x0=Math.floor(X),y0=Math.floor(Y),fx=X-x0,fy=Y-y0;
 const g=(a,b)=>px((a+0.5)/256,(b+0.5)/256);const[a,b,c,d]=[await g(x0,y0),await g(x0+1,y0),await g(x0,y0+1),await g(x0+1,y0+1)];
 return a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy}
const data=[];for(let j=0;j<NY;j++){const lat=B.n+(B.s-B.n)*j/(NY-1);for(let i=0;i<NX;i++){const lon=B.w+(B.e-B.w)*i/(NX-1);data.push(Math.round(await h(lon,lat)*10)/10)}}
fs.mkdirSync('data',{recursive:true});fs.writeFileSync('data/heights.json',JSON.stringify({...B,nx:NX,ny:NY,data}));
console.log('min',Math.min(...data),'max',Math.max(...data));
