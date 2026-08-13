/* Remove works from js/data.js by id, keeping the file's shape and comments.
   Usage: node _build/drop-works.cjs <id> [<id> ...] */
const fs = require('fs');
const path = require('path');

const drop = process.argv.slice(2);
if (!drop.length) { console.error('usage: node drop-works.cjs <id> ...'); process.exit(1); }

const file = path.join(__dirname, '..', 'js', 'data.js');
const src = fs.readFileSync(file, 'utf8');

const open = src.indexOf('[');
const close = src.lastIndexOf(']');
const head = src.slice(0, open + 1);
const tail = src.slice(close);
const body = src.slice(open + 1, close);

/* split the array into top-level object literals */
const parts = [];
let depth = 0, cur = '';
for (const ch of body) {
  if (ch === '{') depth++;
  if (ch === '}') depth--;
  cur += ch;
  if (depth === 0 && ch === '}') { parts.push(cur.trim()); cur = ''; }
}
/* Each captured chunk still carries whatever separator preceded it. Left in
   place, re-joining with ',' yields ',' ',' pairs — which is not a syntax
   error, it is a SPARSE array with holes, and the console then indexes past
   undefined entries. Strip separators down to the object literal itself. */
for (let i = 0; i < parts.length; i++) parts[i] = parts[i].replace(/^,\s*/, '').trim();

const kept = parts.filter((p) => !drop.some((id) => new RegExp("id:\\s*'" + id + "'").test(p)));
const removed = parts.length - kept.length;

fs.writeFileSync(file, head + '\n  ' + kept.join(',\n  ') + '\n' + tail);
console.log('removed ' + removed + ', kept ' + kept.length);
if (removed !== drop.length) console.error('! expected to remove ' + drop.length);
