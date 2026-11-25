import http from 'node:http';
import { chromium } from 'playwright';
import { SlidePdf } from './slide-pdf.mjs';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { readFileSync } from 'node:fs';
const home = readFileSync(new URL('./index.html',import.meta.url));
const allowed = url => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      ['canva.com','www.canva.com'].includes(u.hostname) && /^\/design\/[\w-]+(?:\/[\w-]+)?\/view\/?$/.test(u.pathname);
  } catch { return false; }
};
async function convert(link, browser, doc) {
  const context = await browser.newContext({viewport:{width:1280,height:800},locale:'en-US',serviceWorkers:'block',acceptDownloads:false});
  await context.route('**/*',route=>{
    const u = new URL(route.request().url());
    if(route.request().resourceType()==='media')return route.abort();
    const trusted = ['canva.com','canva-static.com','canva-apps.com','canva.cn'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d));
    return u.protocol==='https:' && !u.port && trusted ? route.continue() : route.abort();
  });
  const page=await context.newPage();
  const url=new URL(link); url.hash='';
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:45000});
  const counter=page.getByRole('button',{name:'Go to page',exact:true});
  await counter.waitFor({timeout:18000});
  for(const name of ['Reject all','Decline all','Only necessary cookies']){
    const b=page.getByRole('button',{name,exact:true});
    if(await b.isVisible()) {await b.click();break;}
  }
  const readCounter=async()=>{
    const pair=(await counter.innerText()).trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    if(!pair) throw Error('Không đọc được số trang từ Canva.');
    return pair.slice(1).map(Number);
  };
  const [first,total]=await readCounter();
  if(!Number.isSafeInteger(total)||total<1||total>150||first<1||first>total)throw Error('Bản này hỗ trợ trình chiếu từ 1 đến 150 trang.');
  const move=async(expected,direction)=>{
    await page.getByRole('button',{name:direction+' page',exact:true}).click({timeout:6000});
    await page.waitForFunction(({expected,total})=>document.querySelector('button[aria-label="Go to page"]')?.textContent.replace(/\s+/g,'')===expected+'/'+total,{expected,total},{timeout:10000});
  };
  for(let n=first-1;n>=1;n--)await move(n,'Previous');

  await page.mouse.move(0,0);
  for(let n=1;n<=total;n++){
    if(n>1) await move(n,'Next');
    await page.mouse.move(0,0);
    await page.waitForTimeout(1600);
    await page.evaluate(()=>document.fonts.ready.then(()=>true));
    const clip=await page.evaluate(()=>{
      const w=innerWidth,h=innerHeight;
      let el=document.elementFromPoint(w/2,h/2), rect=null;
      while(el){
        const r=el.getBoundingClientRect();
        if(r.width>w*.32&&r.height>h*.32&&r.x>=-1&&r.y>=-1&&r.right<=w+1&&r.bottom<=h+1&&(r.width<w-4||r.height<h-4)&&Math.abs(r.x+r.width/2-w/2)<10&&Math.abs(r.y+r.height/2-h/2)<15)rect={x:Math.max(0,r.x),y:Math.max(0,r.y),width:r.width,height:r.height};
        el=el.parentElement;
      }
      return rect;
    });
    if(!clip)throw Error('Không xác định được vùng slide ở trang '+n+'.');
    const [current,count]=await readCounter();
    if(current!==n||count!==total)throw Error('Bộ đếm trang thay đổi trong khi quét.');
    const capture={x:Math.ceil(clip.x),y:Math.ceil(clip.y),width:Math.floor(clip.width),height:Math.floor(clip.height)};
    const jpeg=await page.screenshot({type:'jpeg',quality:85,clip:capture,timeout:12000});
    await doc.add(jpeg,capture.width,capture.height);
  }
  await doc.finish();
}
let busy=false;
http.createServer(async(req,res)=>{
  const fail=(status,msg)=>{if(!res.destroyed && !res.headersSent)res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'}).end(msg)};
  const origin=req.headers.origin;
  if(origin==='https://duke-121.github.io'){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
    if(req.method==='OPTIONS' && req.url==='/convert')return res.writeHead(204,{'Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST'}).end();
  }
  if(req.method==='GET'&&req.url==='/')return res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(home);
  if(req.method!=='POST'||req.url!=='/convert')return fail(404,'Không tìm thấy.');
  if(req.headers['content-type']!=='application/json')return fail(415,'Cần gửi JSON.');
  if(busy)return fail(429,'Máy chủ đang xử lý một bài khác. Vui lòng thử lại sau.');
  let body='',link;
  try{
    for await(const chunk of req){if(body.length+chunk.length>4096)return fail(413,'Link quá dài.');body+=chunk;}
    link=JSON.parse(body).link;
  }catch{return fail(400,'Dữ liệu không hợp lệ.');}
  if(!allowed(link))return fail(400,'Hãy nhập link xem Canva dạng https://www.canva.com/design/…/view.');
  if(busy)return fail(429,'Máy chủ đang bận.');
  busy=true;
  let browser,dir,handle,aborted=false;
  const stop=()=>{aborted=true;browser?.close().catch(()=>{});};
  const timer=setTimeout(stop,8*60*1000);
  res.once('close',stop);
  try{
    dir=await mkdtemp(join(tmpdir(),'canva-pdf-'));
    const path=join(dir,'slides.pdf');
    handle=await open(path,'wx');
    browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--renderer-process-limit=2','--disk-cache-size=8388608']});
    if(aborted)throw new Error('cancelled');
    await convert(link,browser,new SlidePdf(handle));
    await browser.close();
    browser=null;
    await handle.close();
    handle=null;
    res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="slide-canva.pdf"','Cache-Control':'no-store'});
    await pipeline(createReadStream(path),res);
  }catch(e){
    const known=/^(Bản này|Không xác định|Không đọc|Bộ đếm)/.test(e.message);
    fail(422,known?e.message:'Không thể quét đủ trang. Hãy kiểm tra link xem công khai. Canva có thể yêu cầu đăng nhập, chặn trình duyệt máy chủ hoặc tải quá lâu.');
  }finally{clearTimeout(timer);res.off('close',stop);try{await browser?.close();}finally{try{await handle?.close();}finally{try{if(dir)await rm(dir,{recursive:true,force:true});}finally{busy=false;}}}}
}).listen(Number(process.env.PORT)||3000,'0.0.0.0');
