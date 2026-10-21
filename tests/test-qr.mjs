// QR codes (src/qr.js, repris de Mana Orbit) : décodeur indépendant écrit d'après la norme (tables recopiées, lecture façon ZXing), et matrices de référence.
// Les adresses des tests sont celles de Mana Orbit : les matrices de référence (qrcodegen) ont été calculées sur ces textes exacts.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const Q = createRequire(import.meta.url)('../src/qr.js');
const QR_ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94]];
const QR_M = { 1: [[1, 26, 16]], 2: [[1, 44, 28]], 3: [[1, 70, 44]], 4: [[2, 50, 32]], 5: [[2, 67, 43]], 6: [[4, 43, 27]], 7: [[4, 49, 31]], 8: [[2, 60, 38], [2, 61, 39]], 9: [[3, 58, 36], [2, 59, 37]], 10: [[4, 69, 43], [1, 70, 44]],
  11: [[1, 80, 50], [4, 81, 51]], 12: [[6, 58, 36], [2, 59, 37]], 13: [[8, 59, 37], [1, 60, 38]], 14: [[4, 64, 40], [5, 65, 41]], 15: [[5, 65, 41], [5, 66, 42]], 16: [[7, 73, 45], [3, 74, 46]], 17: [[10, 74, 46], [1, 75, 47]], 18: [[9, 69, 43], [4, 70, 44]], 19: [[3, 70, 44], [11, 71, 45]], 20: [[3, 67, 41], [13, 68, 42]] };      // niveau M : [blocs, octets, dont données]
const GF = { exp: [], log: [] }; { let x = 1; for (let i = 0; i < 255; i++) { GF.exp[i] = x; GF.log[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; } }
const gmul = (a, b) => (a && b ? GF.exp[(GF.log[a] + GF.log[b]) % 255] : 0);
const bchOk = (word, gen, dataBits, eccBits) => { let r = (word >> eccBits) << eccBits; for (let i = dataBits + eccBits - 1; i >= eccBits; i--) if ((r >> i) & 1) r ^= gen << (i - eccBits); return r === (word & ((1 << eccBits) - 1)); };
/** Matrice (lignes, 1 = foncé) → { v, mask, text } ; lève une erreur si un contrôle échoue (motifs, format, version, Reed-Solomon, remplissage). */
function qrDecode(m) {
  const n = m.length, v = (n - 17) / 4, get = (x, y) => m[y][x];
  assert.ok(Number.isInteger(v) && v >= 1 && v <= 20, 'taille ' + n);
  for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) assert.equal(get(ox + x, oy + y), +(x === 0 || x === 6 || y === 0 || y === 6 || (x > 1 && x < 5 && y > 1 && y < 5)), 'repère');
  for (let i = 8; i < n - 8; i++) { assert.equal(get(i, 6), +(i % 2 === 0), 'synchronisation'); assert.equal(get(6, i), +(i % 2 === 0)); }
  assert.equal(get(8, n - 8), 1, 'module toujours foncé');
  let f1 = 0, f2 = 0;      // format : copie autour du repère haut gauche, puis copie partagée bas gauche / haut droit (bit de poids fort d'abord)
  for (let x = 0; x < 6; x++) f1 = (f1 << 1) | get(x, 8);
  f1 = (f1 << 1) | get(7, 8); f1 = (f1 << 1) | get(8, 8); f1 = (f1 << 1) | get(8, 7);
  for (let y = 5; y >= 0; y--) f1 = (f1 << 1) | get(8, y);
  for (let y = n - 1; y >= n - 7; y--) f2 = (f2 << 1) | get(8, y);
  for (let x = n - 8; x < n; x++) f2 = (f2 << 1) | get(x, 8);
  assert.equal(f1, f2, 'deux copies du format'); const fmt = f1 ^ 0x5412;
  assert.ok(bchOk(fmt, 0x537, 5, 10), 'BCH du format'); assert.equal(fmt >> 13, 0, 'niveau M'); const mask = (fmt >> 10) & 7;
  if (v >= 7) { let vb = 0; for (let y = 5; y >= 0; y--) for (let x = n - 9; x >= n - 11; x--) vb = (vb << 1) | get(x, y); assert.equal(vb >> 12, v, 'version écrite'); assert.ok(bchOk(vb, 0x1F25, 6, 12), 'BCH de la version');
    let vb2 = 0; for (let x = 5; x >= 0; x--) for (let y = n - 9; y >= n - 11; y--) vb2 = (vb2 << 1) | get(x, y); assert.equal(vb2, vb, 'deux copies de la version'); }
  const fn = Array.from({ length: n }, () => new Uint8Array(n)), region = (l, t, w, h) => { for (let y = t; y < t + h; y++) for (let x = l; x < l + w; x++) fn[y][x] = 1; };
  region(0, 0, 9, 9); region(n - 8, 0, 8, 9); region(0, n - 8, 9, 8); region(6, 9, 1, n - 17); region(9, 6, n - 17, 1);
  const al = QR_ALIGN[v]; for (let a = 0; a < al.length; a++) for (let b = 0; b < al.length; b++) { if ((a === 0 && (b === 0 || b === al.length - 1)) || (a === al.length - 1 && b === 0)) continue; region(al[b] - 2, al[a] - 2, 5, 5);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) assert.equal(get(al[b] + dx, al[a] + dy), +(Math.max(Math.abs(dx), Math.abs(dy)) !== 1), 'alignement'); }
  if (v >= 7) { region(n - 11, 0, 3, 6); region(0, n - 11, 6, 3); }
  const masked = [(i, j) => (i + j) % 2 === 0, i => i % 2 === 0, (i, j) => j % 3 === 0, (i, j) => (i + j) % 3 === 0, (i, j) => ((i >> 1) + Math.floor(j / 3)) % 2 === 0, (i, j) => (i * j) % 6 === 0, (i, j) => (i * j) % 6 < 3, (i, j) => (i + j + (i * j) % 3) % 2 === 0][mask];      // i : ligne, j : colonne
  const raw = []; let up = true, cur = 0, nb = 0;
  for (let j = n - 1; j > 0; j -= 2) {
    if (j === 6) j--;
    for (let c = 0; c < n; c++) { const i = up ? n - 1 - c : c; for (let k = 0; k < 2; k++) { const x = j - k; if (fn[i][x]) continue; cur = (cur << 1) | (get(x, i) ^ +masked(i, x)); if (++nb === 8) { raw.push(cur); cur = nb = 0; } } }
    up = !up;
  }
  const groups = QR_M[v].flatMap(([k, len, dlen]) => Array.from({ length: k }, () => ({ len, dlen, d: [], e: [] })));
  let o = 0; const maxD = Math.max(...groups.map(g => g.dlen));
  for (let i = 0; i < maxD; i++) for (const g of groups) if (i < g.dlen) g.d.push(raw[o++]);
  for (let i = 0; i < groups[0].len - groups[0].dlen; i++) for (const g of groups) g.e.push(raw[o++]);
  assert.equal(o, groups.reduce((a, g) => a + g.len, 0), 'tous les octets lus');
  for (const g of groups) for (let k = 0; k < g.e.length; k++) { let s = 0; const ak = GF.exp[k]; for (const c of [...g.d, ...g.e]) s = gmul(s, ak) ^ c; assert.equal(s, 0, 'syndrome Reed-Solomon nul'); }
  const data = groups.flatMap(g => g.d), bits = data.flatMap(b => Array.from({ length: 8 }, (_, i) => (b >> (7 - i)) & 1)); let p = 0;
  const take = k => { let x = 0; for (let i = 0; i < k; i++) x = (x << 1) | bits[p++]; return x; };
  assert.equal(take(4), 4, 'mode octets'); const len = take(v < 10 ? 8 : 16), bytes = Array.from({ length: len }, () => take(8));
  const rest = bits.length - p; if (rest >= 4) assert.equal(take(4), 0, 'fin de message'); else take(rest);
  while (p % 8) assert.equal(take(1), 0, 'complément à l\'octet');
  for (let pad = 0xEC; p < bits.length; pad ^= 0xEC ^ 0x11) assert.equal(take(8), pad, 'remplissage 0xEC / 0x11');
  return { v, mask, text: new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)) };
}
{
  const url = 'https://card.m2s-photo.fr/?p=Abcdef1234567890XyZw', d = qrDecode(Q.qrMatrix(url).m);
  assert.deepEqual([d.text, d.v], [url, 4], 'lien de partage (49 octets) : version 4');
  { const m = Q.qrMatrix(url).m.map(r => r.slice()), n = m.length; m[n - 1][n - 1] ^= 1; assert.throws(() => qrDecode(m), /Reed-Solomon/, 'le décodeur voit un module faux');
    const f = Q.qrMatrix(url).m.map(r => r.slice()); f[8][0] ^= 1; assert.throws(() => qrDecode(f), /format/, 'et un format abîmé'); }
  for (let v = 1; v <= 20; v++) {      // chaque version, pleine (capacité M en mode octets), tous les masques
    const cap = Q.qrDataCap(v), len = Math.floor((cap * 8 - 4 - (v < 10 ? 8 : 16)) / 8), t = ('https://card.m2s-photo.fr/?p=' + 'Xy7'.repeat(240)).slice(0, len);
    for (let k = 0; k < 8; k++) { const mx = Q.qrMatrix(t, k), r = qrDecode(mx.m); assert.deepEqual([r.text, r.v, r.mask], [t, v, k], `version ${v}, masque ${k}`); }
    if (v < 20) assert.equal(Q.qrMatrix(t + 'z').v, v + 1, 'un octet de plus : version suivante');
  }
  const fr = 'Liste d\'échange · Anneau solaire ✓'; assert.equal(qrDecode(Q.qrMatrix(fr).m).text, fr, 'UTF-8');
  assert.throws(() => Q.qrMatrix('x'.repeat(667)), /trop long/, 'au-delà de la version 20 : refusé'); assert.equal(Q.qrMatrix('x'.repeat(666)).v, 20);
  // matrices de référence (Project Nayuki, qrcodegen 1.8.0, niveau M, masque automatique) : identiques bit à bit, masque compris
  const REF = [['Mana Orbit', 1, 4, 'fe83fc13506e9cbb7565dba9aec16507faafe018008bafcdae7581caa5f9fa26e540004eeffa53d04881baa995d251ee8a2104738feb608'],
    [url, 4, 4, 'fea6a13fc1275c506e9adbabb75b1895dba8cd7aec167a5107faaaaafe01e4fa008be1e5fc9c9db3e392a5ebd152b5b3f001ef4867c9a5b3dc328ae4ad84d10b8ef07628dfa91450d3a3a3c151d555204c8a36f832a7dd68349c386812ce5c1a98b9fae2dbccfd806aa2c5bfb948ab504740d11baf39efddd121fdd2e98c34e104f3b988fed676c48'],
    ['https://card.m2s-photo.fr/?p=AbcdefGhijklmnopQRST&utm=0123456789abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnop-ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8, 4, 'fed95d365cbfc116ad57c9d06e9bbcc4fa6bb756dc9142a5dba8243fb082ec1425b1055107faaaaaaaaafe0103346313008bad73f7c87c8e3d0539cdb328d53dbec3109daf5f701d9f7e7a4cbd4dd8a5aba4c9dc194bae00c88c5b9841ed0f92255edb2895f2bf4a585246d3a5baa2d1518c1a4f87385f76713b5064533d1cc9f127af63761b107eebaffc6be0f13bd463f916babf32b19eab647f6719074733e62efc80ff0c98d260fda448a087982a87a3699115d0dd714950a10e3c28614ef612248522b85676fa41604dd6cf69661ac5b7720e51929af1c63dac73a2e32319eb7623895dbef1711d07c56d6e58e18c1443d835e3f15be5dcfa006155118dc73fa8bbac81aa10417ac6df516bad28fe6fffe5d059d07c1106e91fd0fa3acf04ff88d2e506feb774f09d598']];
  for (const [t, v, mask, hex] of REF) {
    const mx = Q.qrMatrix(t), bits = [...hex].flatMap(h => [...parseInt(h, 16).toString(2).padStart(4, '0')].map(Number)), n = v * 4 + 17;
    assert.deepEqual([mx.v, mx.mask], [v, mask], 'version et masque de la référence : ' + t.slice(0, 20));
    for (let y = 0; y < n; y++) assert.deepEqual([...mx.m[y]], bits.slice(y * n, y * n + n), `ligne ${y} identique à la référence (${t.slice(0, 20)}…)`);
    assert.equal(qrDecode(mx.m).text, t);
  }
  // SVG : un chemin qui couvre exactement les modules foncés, marge de 4 modules
  const { n, svg } = Q.qrSvg(url), mx = Q.qrMatrix(url), got = Array.from({ length: mx.n }, () => new Uint8Array(mx.n));
  assert.equal(n, mx.n + 8); assert.match(svg, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"`));
  for (const [, x, y, w] of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) for (let i = 0; i < +w; i++) { assert.equal(got[y - 4][x - 4 + i], 0, 'jamais deux fois'); got[y - 4][x - 4 + i] = 1; }
  assert.deepEqual(got.map(r => [...r].join('')), [...mx.m].map(r => [...r].join('')), 'SVG = matrice');
  console.log('✓ QR code : décodé (repères, format, version, masque, Reed-Solomon, texte) pour les versions 1 à 10 et les 8 masques, identique aux matrices de référence, SVG fidèle');
}
