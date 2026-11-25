(()=>{
  if(globalThis.nepGiayInstalled) return;
  globalThis.nepGiayInstalled=true;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function navigation(){
    const buttons=[...document.querySelectorAll("button")].filter(b=>b.getBoundingClientRect().width);
    const counter=buttons.find(b=>/^\s*\d+\s*\/\s*\d+\s*$/.test(b.textContent));
    if(!counter) return null;
    const [page,total]=counter.textContent.match(/\d+/g).map(Number);
    return {page,total,previous:counter.previousElementSibling?.closest("button")||buttons[buttons.indexOf(counter)-1],next:counter.nextElementSibling?.closest("button")||buttons[buttons.indexOf(counter)+1]};
  }
  async function until(test){
    const end=Date.now()+12000;
    while(Date.now()<end){const result=test();if(result)return result;await wait(160);}
    throw new Error("Không xác nhận được số trang. Hãy mở trình chiếu Canva, đóng thông báo đang che slide rồi thử lại.");
  }
  function bounds(){
    const w=innerWidth,h=innerHeight;
    let element=document.elementFromPoint(w/2,h/2),best=null;
    while(element){
      const r=element.getBoundingClientRect();
      if(r.width>w*.35 && r.height>h*.35 && r.left>=-2 && r.top>=-2 && r.right<=w+2 && r.bottom<=h+2 && (r.width<w-4 || r.height<h-4) && Math.abs(r.left+r.width/2-w/2)<8 && Math.abs(r.top+r.height/2-h/2)<12) best=r;
      element=element.parentElement;
    }
    return best||{x:0,y:0,width:w,height:h};
  }
  async function move(state,delta){
    const control=delta===1?state.next:state.previous;
    if(!control || control.disabled)throw new Error("Canva chưa cho chuyển trang.");
    control.click();
    return until(()=>{const n=navigation();return n?.page===state.page+delta && n.total===state.total && n;});
  }
  async function scan(token){
    let state=await until(navigation);
    while(state.page>1)state=await move(state,-1);
    const doc=await PDFLib.PDFDocument.create();
    for(;;){
      await wait(1800);
      await document.fonts.ready;
      if(document.hidden || navigation()?.page!==state.page)throw new Error("Tab hoặc trang đã thay đổi trong khi quét.");
      const box=bounds(),width=innerWidth,height=innerHeight;
      const frame=await chrome.runtime.sendMessage({type:"frame",token,page:state.page});
      if(!frame?.data)throw new Error(frame?.error||"Không nhận được ảnh slide.");
      if(document.hidden || navigation()?.page!==state.page || innerWidth!==width || innerHeight!==height)throw new Error("Vùng trình chiếu đã thay đổi.");
      const img=new Image();img.src=frame.data;await img.decode();
      const sx=img.naturalWidth/width,sy=img.naturalHeight/height;
      const c=document.createElement("canvas");
      c.width=Math.round(box.width*sx);c.height=Math.round(box.height*sy);
      c.getContext("2d").drawImage(img,box.x*sx,box.y*sy,c.width,c.height,0,0,c.width,c.height);
      const jpg=await new Promise(r=>c.toBlob(r,"image/jpeg",.95));
      const pic=await doc.embedJpg(await jpg.arrayBuffer());
      const page=doc.addPage([box.width*.75,box.height*.75]);
      page.drawImage(pic,{width:page.getWidth(),height:page.getHeight()});
      if(state.page===state.total)break;
      state=await move(state,1);
    }
    const url=URL.createObjectURL(new Blob([await doc.save()],{type:"application/pdf"}));
    const a=document.createElement("a");a.href=url;
    a.download=(document.title.replace(/[\\/:*?"<>|]/g," ").trim()||"Canva")+".pdf";
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  let running=false;
  chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
    if(msg.type!=="scan")return;
    if(running){reply({error:"Phiên trước đang dừng. Hãy thử lại sau vài giây."});return;}
    running=true;
    scan(msg.token).then(()=>reply({ok:true}),e=>{alert("Nếp Giấy: "+e.message);reply({error:e.message});}).finally(()=>{running=false;});
    return true;
  });
})();
