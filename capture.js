const video = byId("preview");
const message = byId("captureStatus");
const sample = document.createElement("canvas");
sample.width = 128;
sample.height = 72;
const pixels = sample.getContext("2d",{willReadFrequently:true});
let stream, timer, prior, saved, stableSince, session = 0, recording = false, serial = 0;
function difference(a,b) {
  if (!b) return Infinity;
  let changed = 0;
  for(let i=0;i<a.length;i+=4) {
    if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>30) changed++;
  }
  return changed/(a.length/4);
}
function stopCapture() {
  session++;
  clearInterval(timer);
  if(stream) stream.getTracks().forEach(track=>track.stop());
  stream = null;
  video.srcObject = null;
  video.hidden = true;
  byId("share").disabled = false;
  byId("snap").disabled = byId("stopCapture").disabled = true;
  message.textContent = "Đã dừng thu. Kiểm tra danh sách rồi chọn Ghép và tải PDF.";
}
async function capture(manual=false) {
  if(!stream || recording || busy || !video.videoWidth || video.readyState<2) return;
  pixels.drawImage(video,0,0,sample.width,sample.height);
  const frame = pixels.getImageData(0,0,sample.width,sample.height).data;
  const now = performance.now();
  if(difference(frame,prior)>0.001) {stableSince=now;prior=frame;}
  if(!manual && (now-stableSince<1100 || difference(frame,saved)<0.001)) return;
  const current = session;
  recording = true;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video,0,0);
    const blob = await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.95));
    const doc = await PDFLib.PDFDocument.create();
    const image = await doc.embedJpg(await blob.arrayBuffer());
    const page = doc.addPage([canvas.width*.75,canvas.height*.75]);
    page.drawImage(image,{width:page.getWidth(),height:page.getHeight()});
    if(current!==session) return;
    saved=frame;
    queue.push({name:"Slide-"+String(++serial).padStart(3,"0"),doc});
    render();
    message.textContent = "Đã thu slide "+serial+".";
  } catch {
    if(current===session){stopCapture();message.textContent="Thu hình bị gián đoạn. Các trang đã thu vẫn còn trong danh sách.";}
  } finally {recording=false;}
}
byId("snap").onclick=()=>capture(true);
byId("stopCapture").onclick=stopCapture;
byId("share").onclick=async()=>{
  if(!navigator.mediaDevices?.getDisplayMedia){message.textContent="Hãy mở trang này trong Chrome hoặc Edge trên máy tính để chia sẻ tab.";return;}
  byId("share").disabled=true;
  try {
    stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:"browser"},audio:false,selfBrowserSurface:"exclude"});
    const track=stream.getVideoTracks()[0];
    if(track.getSettings().displaySurface && track.getSettings().displaySurface!=="browser"){
      stopCapture();message.textContent="Hãy chọn một tab trình duyệt trong hộp chia sẻ.";return;
    }
    track.onended=stopCapture;
    video.srcObject=stream;
    await video.play();
    if(!stream)return;
    video.hidden=false;
    prior=saved=null;
    byId("snap").disabled=byId("stopCapture").disabled=false;
    message.textContent="Đang thu. Chuyển slide trong tab Canva sau khi trang đầu đã đứng yên.";
    timer=setInterval(()=>capture(),350);
  } catch {stopCapture();message.textContent="Chưa thể chia sẻ tab. Chọn lại tab Canva và nhấn Chia sẻ.";}
};
