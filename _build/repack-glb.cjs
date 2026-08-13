/* ============================================================
   Repack a .glb with replacement images.

   The whole binary chunk is rebuilt rather than patched: image bufferViews
   change length, so every later bufferView's byteOffset moves. Accessors
   address their data as an offset INTO a bufferView, so they stay valid as
   long as each view's bytes are copied intact and the view stays aligned —
   hence the 4-byte padding on every view.

   Usage: node repack-glb.js <in.glb> <out.glb> <index>=<file> [<index>=<file>…]
   ============================================================ */
const fs = require('fs');
const path = require('path');

const [, , inPath, outPath, ...pairs] = process.argv;
if (!inPath || !outPath || !pairs.length) {
  console.error('usage: node repack-glb.js <in.glb> <out.glb> <imageIndex>=<file> ...');
  process.exit(1);
}

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

const buf = fs.readFileSync(inPath);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb');

const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const binHeaderAt = 20 + jsonLen;
const binLen = buf.readUInt32LE(binHeaderAt);
const binStart = binHeaderAt + 8;

if (json.buffers.length !== 1 || json.buffers[0].uri) throw new Error('expected one embedded buffer');

/* replacement images, keyed by image index */
const replace = new Map();
for (const p of pairs) {
  const [i, file] = p.split('=');
  const ext = path.extname(file).toLowerCase();
  if (!MIME[ext]) throw new Error('unsupported image type: ' + ext);
  replace.set(Number(i), { data: fs.readFileSync(file), mime: MIME[ext] });
}

/* pull every bufferView's bytes out before anything moves */
const views = json.bufferViews.map((bv) => {
  const off = binStart + (bv.byteOffset || 0);
  return buf.slice(off, off + bv.byteLength);
});

/* swap in the new image bytes */
for (const [imgIndex, img] of replace) {
  const image = json.images[imgIndex];
  if (!image || image.bufferView === undefined) throw new Error('image ' + imgIndex + ' is not embedded');
  views[image.bufferView] = img.data;
  image.mimeType = img.mime;
}

/* re-lay the buffer out, 4-byte aligned */
const parts = [];
let offset = 0;
json.bufferViews.forEach((bv, i) => {
  const data = views[i];
  bv.byteOffset = offset;
  bv.byteLength = data.length;
  /* a view that feeds vertex attributes keeps its stride; nothing else about
     it changes, and image views never have one */
  parts.push(data);
  offset += data.length;
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { parts.push(Buffer.alloc(pad)); offset += pad; }
});

const newBin = Buffer.concat(parts, offset);
json.buffers[0].byteLength = newBin.length;

/* chunks are padded: JSON with spaces, BIN with zeros */
let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

const binPad = (4 - (newBin.length % 4)) % 4;
const binBuf = binPad ? Buffer.concat([newBin, Buffer.alloc(binPad)]) : newBin;

const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
const out = Buffer.alloc(total);
let o = 0;
out.writeUInt32LE(0x46546c67, o); o += 4;      // 'glTF'
out.writeUInt32LE(2, o); o += 4;               // version
out.writeUInt32LE(total, o); o += 4;
out.writeUInt32LE(jsonBuf.length, o); o += 4;
out.writeUInt32LE(0x4e4f534a, o); o += 4;      // 'JSON'
jsonBuf.copy(out, o); o += jsonBuf.length;
out.writeUInt32LE(binBuf.length, o); o += 4;
out.writeUInt32LE(0x004e4942, o); o += 4;      // 'BIN'
binBuf.copy(out, o);

fs.writeFileSync(outPath, out);

console.log('in  ', (buf.length / 1048576).toFixed(2), 'MB');
console.log('out ', (out.length / 1048576).toFixed(2), 'MB');
console.log('saved', (((buf.length - out.length) / buf.length) * 100).toFixed(1) + '%');
