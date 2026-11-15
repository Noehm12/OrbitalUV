// Runs the browser code (web/js/lunar.js) on the real data files, without a browser:
// one week of date maps and the zone ranking for the same week.
// Run with: node tests/test_web_maps.js
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const webDir = path.join(__dirname, "..", "web");
const dataDir = path.join(webDir, "data");
const Lunar = require(path.join(webDir, "js", "lunar.js"));
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));

// Sun/Earth table
const ephem = readJson("ephem_6h.json");
const raw = Buffer.from(ephem.data, "base64");
Lunar.loadEphem(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));

// 1 km horizons
const meta = readJson("horizons_1km.json");
const horizons = fs.readFileSync(path.join(dataDir, meta.binary));
assert.equal(horizons.length, meta.nx * meta.ny * meta.naz);

// one week, every hour
const start = Date.parse("2027-03-15T00:00:00Z");
const end = start + 7 * 86400000;
const times = [];
for (let t = start; t <= end; t += 3600000) times.push(t);

const dirs = Lunar.directionsFromPole(times);
const maps = Lunar.visibilityMaps(horizons, meta, dirs.sun, dirs.earth);
for (let k = 0; k < meta.nx * meta.ny; k++) {
  for (const v of [maps.sun[k], maps.earth[k], maps.both[k]]) {
    assert(Number.isFinite(v) && v >= 0 && v <= 100, `cell ${k}: ${v}`);
  }
  // "both" can never be higher than either of the two on its own
  assert(maps.both[k] <= Math.min(maps.sun[k], maps.earth[k]) + 1e-5);
}
for (const layer of ["sun", "earth", "both"]) {
  const mean = maps[layer].reduce((a, b) => a + b, 0) / maps[layer].length;
  console.log(`${layer}: mean ${mean.toFixed(1)} %`);
}

// zone ranking with the candidates' own 720-direction horizons, every 5 minutes
const site = readJson("site.json");
const cands = site.cands;
const naz = site.candH.naz;
const h16 = Buffer.from(site.candH.b64, "base64");
assert.equal(h16.length, cands.length * naz * 2);

const eph = Lunar.ephemeris(start, end, 5 * 60000);
const stats = cands.map((c, i) => {
  const H = new Float32Array(naz);
  for (let a = 0; a < naz; a++) H[a] = h16.readInt16LE(2 * (i * naz + a)) * site.candH.scale;
  return Lunar.analyse(c, eph, H).stats;
});
const zones = Lunar.rankZones(cands, stats, 168, { radius: 20000, minSep: 40000, maxZones: 6, perZone: 6 });
assert(zones.length > 0);
console.log(`${cands.length} candidates, ${zones.length} zones, ${times.length} instants: ok`);
