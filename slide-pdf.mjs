// PDF 1.4 writer for the RGB JPEG screenshots produced by Chromium.
export class SlidePdf {
  constructor(handle) {
    this.handle = handle;
    this.offset = 0;
    this.offsets = [0];
    this.pages = [];
  }

  async write(value) {
    const bytes = typeof value === 'string' ? Buffer.from(value, 'ascii') : value;
    await this.handle.writeFile(bytes);
    this.offset += bytes.length;
  }

  async object(id, body) {
    this.offsets[id] = this.offset;
    await this.write(id + ' 0 obj\n' + body + '\nendobj\n');
  }

  async add(jpeg, width, height) {
    if (!this.pages.length) await this.write('%PDF-1.4\n');
    const id = 3 + this.pages.length * 3;
    const w = width * 0.75, h = height * 0.75;
    const draw = 'q ' + w + ' 0 0 ' + h + ' 0 0 cm /Slide Do Q\n';
    await this.object(id, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + w + ' ' + h + '] /Resources << /XObject << /Slide ' + (id+2) + ' 0 R >> >> /Contents ' + (id+1) + ' 0 R >>');
    await this.object(id+1, '<< /Length ' + draw.length + ' >>\nstream\n' + draw + 'endstream');
    this.offsets[id+2] = this.offset;
    await this.write((id+2) + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + width + ' /Height ' + height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>\nstream\n');
    await this.write(jpeg);
    await this.write('\nendstream\nendobj\n');
    this.pages.push(id);
  }

  async finish() {
    await this.object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    await this.object(2, '<< /Type /Pages /Count ' + this.pages.length + ' /Kids [' + this.pages.map(id=>id+' 0 R').join(' ') + '] >>');
    const start = this.offset;
    const entries = this.offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
    await this.write('xref\n0 '+this.offsets.length+'\n0000000000 65535 f \n'+entries+'trailer\n<< /Root 1 0 R /Size '+this.offsets.length+' >>\nstartxref\n'+start+'\n%%EOF\n');
  }
}