const byId = id => document.getElementById(id);
const queue = [];
const collator = new Intl.Collator("vi", {numeric:true, sensitivity:"base"});
let busy = false;
function render() {
  byId("queue").replaceChildren();
  byId("total").textContent = queue.length ? queue.length + " tệp · " + queue.reduce((sum,item) => sum + item.doc.getPageCount(),0) + " trang" : "Chưa có tệp.";
  queue.forEach((item,index) => {
    const row = document.createElement("li");
    row.append(item.name + " · " + item.doc.getPageCount() + " trang");
    const actions = document.createElement("span");
    actions.className = "actions";
    function action(label,disabled,handler) {
      const button = document.createElement("button");
      button.textContent = label;
      button.setAttribute("aria-label",label + " — " + item.name);
      button.disabled = busy || disabled;
      button.onclick = () => { handler(); byId("feedback").textContent = ""; render(); };
      actions.append(button);
    }
    action("Lên",index===0,() => queue.splice(index-1,0,queue.splice(index,1)[0]));
    action("Xuống",index===queue.length-1,() => queue.splice(index+1,0,queue.splice(index,1)[0]));
    action("Bỏ",false,() => queue.splice(index,1));
    row.append(actions);
    byId("queue").append(row);
  });
  byId("choose").disabled = busy;
  byId("sort").disabled = busy || queue.length < 2;
  byId("save").disabled = busy || !queue.length;
}
async function addFiles(files) {
  if (busy || !files.length) return;
  busy = true;
  render();
  const errors = [];
  byId("feedback").textContent = "Đang đọc PDF…";
  for (const file of Array.from(files).sort((a,b) => collator.compare(a.name,b.name))) {
    try {
      const doc = await PDFLib.PDFDocument.load(await file.arrayBuffer());
      if (!doc.getPageCount()) throw new Error();
      queue.push({name:file.name,doc});
    } catch {
      errors.push("Bỏ qua " + file.name + ". Tệp có thể bị khóa, bị lỗi hoặc không phải PDF.");
    }
  }
  busy = false;
  byId("feedback").textContent = errors.join("\n");
  render();
}
async function merge(items) {
  const output = await PDFLib.PDFDocument.create();
  for (const {doc} of items) {
    const pages = await output.copyPages(doc,doc.getPageIndices());
    for (const page of pages) output.addPage(page);
  }
  return output.save();
}
byId("choose").onclick = () => byId("files").click();
byId("files").onchange = event => {
  const files = Array.from(event.target.files);
  event.target.value = "";
  addFiles(files);
};
const drop = byId("drop");
drop.ondragover = event => {event.preventDefault(); drop.classList.add("over");};
drop.ondragleave = () => drop.classList.remove("over");
drop.ondrop = event => {
  event.preventDefault();
  drop.classList.remove("over");
  addFiles(event.dataTransfer.files);
};
byId("sort").onclick = () => {queue.sort((a,b) => collator.compare(a.name,b.name)); render();};
byId("save").onclick = async () => {
  busy = true;
  render();
  byId("feedback").textContent = "Đang ghép các trang…";
  try {
    const bytes = await merge(queue);
    const url = URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = "slide-da-ghep.pdf";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url),60000);
    byId("feedback").textContent = "Đã tạo slide-da-ghep.pdf.";
  } catch {
    byId("feedback").textContent = "Ghép chưa thành công. Hãy kiểm tra các tệp hoặc thử ghép ít tệp hơn.";
  } finally {busy = false; render();}
};
render();
