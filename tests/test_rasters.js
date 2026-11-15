// Checks the raw map layers in web/data against rasters.json (size and SHA-256).
// Run with: node tests/test_rasters.js
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const dataDir = path.join(__dirname, "..", "web", "data");
const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, "rasters.json"), "utf8"));

for (const [name, layer] of Object.entries(manifest)) {
  const bytes = fs.readFileSync(path.join(dataDir, layer.file));
  assert.equal(bytes.length, layer.width * layer.height * layer.channels, `${name}: wrong size`);
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  assert.equal(hash, layer.sha256, `${name}: checksum does not match`);
  console.log(`${name}: ok`);
}
