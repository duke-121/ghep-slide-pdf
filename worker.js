const sessions = new Map();
function viewer(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ["canva.com","www.canva.com"].includes(u.hostname) && /^\/design\/[^/]+(?:\/[^/]+)?\/view\/?$/.test(u.pathname);
  } catch {return false;}
}
function badge(tabId,text) {
  return chrome.action.setBadgeText({tabId,text});
}
chrome.action.onClicked.addListener(async tab => {
  if (!viewer(tab.url)) {
    await chrome.action.setTitle({tabId:tab.id,title:"Hãy mở link trình chiếu Canva dạng /design/…/view."});
    await badge(tab.id,"LINK");
    return;
  }
  if (sessions.has(tab.id)) {
    sessions.delete(tab.id);
    await badge(tab.id,"STOP");
    return;
  }
  const token = crypto.randomUUID();
  sessions.set(tab.id,token);
  try {
    await badge(tab.id,"…");
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:["pdf-lib.min.js","scan.js"]});
    const result = await chrome.tabs.sendMessage(tab.id,{type:"scan",token});
    if (!result?.ok) throw new Error(result?.error || "Quét bị gián đoạn.");
    await badge(tab.id,"PDF");
  } catch (error) {
    await badge(tab.id,"!");
    await chrome.action.setTitle({tabId:tab.id,title:String(error.message)});
  } finally {
    if(sessions.get(tab.id)===token) sessions.delete(tab.id);
  }
});
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  if(msg.type!=="frame") return;
  const tab=sender.tab;
  (async()=>{
    const check=async()=>{
      if(!tab || !viewer(sender.url) || sender.frameId!==0 || sessions.get(tab.id)!==msg.token) throw new Error("Phiên quét đã dừng. Bấm tiện ích để bắt đầu lại.");
      const [active]=await chrome.tabs.query({active:true,windowId:tab.windowId});
      if(active?.id!==tab.id) throw new Error("Tab Canva phải được giữ ở phía trước trong khi quét.");
    };
    await check();
    const data=await chrome.tabs.captureVisibleTab(tab.windowId,{format:"jpeg",quality:95});
    await check();
    await badge(tab.id,String(msg.page));
    return {data};
  })().then(reply,error=>reply({error:error.message}));
  return true;
});
