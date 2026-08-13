/* ============================================================
   Strip every texture out of a .glb, keeping geometry.

   For a model whose material is going to be replaced in code, the maps are
   pure download weight — nothing ever samples them. Removing them means
   deleting the images, textures and samplers, dropping their bufferViews, and
   then RE-INDEXING every remaining bufferView reference, because accessors
   address views by index and those indices shift.

   Usage: node strip-textures.cjs <in.glb> <out.glb>
   ============================================================ */
const fs = require('fs');

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) { console.error('usage: node strip-textures.cjs <in.glb> <out.glb>'); process.exit(1); }

const buf = fs.readFileSync(inPath);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;

/* which bufferViews belong to images */
const imageViews = new Set();
(json.images || []).forEach((im) => { if (im.bufferView !== undefined) imageViews.add(im.bufferView); });

/* strip texture references from materials, leave them plain white */
(json.materials || []).forEach((m) => {
  const p = m.pbrMetallicRoughness || (m.pbrMetallicRoughness = {});
  delete p.baseColorTexture;
  delete p.metallicRoughnessTexture;
  delete m.normalTexture;
  delete m.occlusionTexture;
  delete m.emissiveTexture;
  delete m.emissiveFactor;
  p.baseColorFactor = [1, 1, 1, 1];
  if (p.metallicFactor === undefined) p.metallicFactor = 1;
  if (p.roughnessFactor === undefined) p.roughnessFactor = 0.5;
});
delete json.images;
delete json.textures;
delete json.samplers;

/* keep every non-image view, and build the old -> new index map */
const keep = [], map = new Map();
json.bufferViews.forEach((bv, i) => {
  if (imageViews.has(i)) return;
  map.set(i, keep.length);
  keep.push({ bv, data: buf.slice(binStart + (bv.byteOffset || 0), binStart + (bv.byteOffset || 0) + bv.byteLength) });
});

/* re-point everything that names a bufferView */
(json.accessors || []).forEach((a) => {
  if (a.bufferView !== undefined) a.bufferView = map.get(a.bufferView);
  if (a.sparse) {
    if (a.sparse.indices) a.sparse.indices.bufferView = map.get(a.sparse.indices.bufferView);
    if (a.sparse.values) a.sparse.values.bufferView = map.get(a.sparse.values.bufferView);
  }
});

/* re-lay the binary chunk, 4-byte aligned */
const parts = [];
let offset = 0;
json.bufferViews = keep.map(({ bv, data }) => {
  bv.byteOffset = offset;
  bv.byteLength = data.length;
  parts.push(data);
  offset += data.length;
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { parts.push(Buffer.alloc(pad)); offset += pad; }
  return bv;
});

const bin = Buffer.concat(parts, offset);
json.buffers[0].byteLength = bin.length;

let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
const jp = (4 - (jsonBuf.length % 4)) % 4;
if (jp) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jp, 0x20)]);
const bp = (4 - (bin.length % 4)) % 4;
const binBuf = bp ? Buffer.concat([bin, Buffer.alloc(bp)]) : bin;

const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
const out = Buffer.alloc(total);
let o = 0;
out.writeUInt32LE(0x46546c67, o); o += 4;
out.writeUInt32LE(2, o); o += 4;
out.writeUInt32LE(total, o); o += 4;
out.writeUInt32LE(jsonBuf.length, o); o += 4;
out.writeUInt32LE(0x4e4f534a, o); o += 4;
jsonBuf.copy(out, o); o += jsonBuf.length;
out.writeUInt32LE(binBuf.length, o); o += 4;
out.writeUInt32LE(0x004e4942, o); o += 4;
binBuf.copy(out, o);

fs.writeFileSync(outPath, out);
console.log('in  ', (buf.length / 1048576).toFixed(2), 'MB');
console.log('out ', (out.length / 1048576).toFixed(2), 'MB');
console.log('saved', (((buf.length - out.length) / buf.length) * 100).toFixed(1) + '%');
