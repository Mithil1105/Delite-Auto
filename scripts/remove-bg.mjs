// One-off local background removal for downloaded product photos.
// Flood-fills from the image border. Seeding compares to a sampled corner
// reference color; the flood step requires a candidate to be BOTH close to
// the already-confirmed neighbor pixel (follows soft vignette/shadow
// gradients in studio photography) AND within a looser cap of the original
// corner color (stops color drift from walking into the product itself).
// Tuned and visually verified against ~15 representative product photos.
import sharp from "sharp";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, "..", "public", "images", "products");

const SEED_THRESHOLD = 30; // how close a border pixel must be to the corner bg color to seed the flood
const LOCAL_THRESHOLD = 20; // how close a neighbor must be to the already-confirmed pixel to keep flooding
const GLOBAL_CAP = 80; // how far a pixel may drift from the original corner bg color, total
const CORNER_PATCH = 6; // sample an NxN patch at each corner to get the bg reference color

function colorDist(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function sampleCornerColor(data, width, height, channels) {
  const patches = [
    [0, 0],
    [width - CORNER_PATCH, 0],
    [0, height - CORNER_PATCH],
    [width - CORNER_PATCH, height - CORNER_PATCH],
  ];
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (const [px, py] of patches) {
    for (let y = py; y < py + CORNER_PATCH; y++) {
      for (let x = px; x < px + CORNER_PATCH; x++) {
        const i = (y * width + x) * channels;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
      }
    }
  }
  return { r: r / n, g: g / n, b: b / n };
}

async function processFile(filePath) {
  const img = sharp(filePath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; // channels === 4 (RGBA) due to ensureAlpha

  const bg = sampleCornerColor(data, width, height, channels);

  const visited = new Uint8Array(width * height);
  const stack = [];

  const pushIfSeed = (x, y) => {
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * channels;
    const a = data[i + 3];
    if (a === 0) {
      visited[idx] = 1;
      stack.push(idx);
      return;
    }
    const d = colorDist(data[i], data[i + 1], data[i + 2], bg.r, bg.g, bg.b);
    if (d <= SEED_THRESHOLD) {
      visited[idx] = 1;
      stack.push(idx);
    }
  };

  for (let x = 0; x < width; x++) {
    pushIfSeed(x, 0);
    pushIfSeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfSeed(0, y);
    pushIfSeed(width - 1, y);
  }

  while (stack.length) {
    const idx = stack.pop();
    const x = idx % width;
    const y = Math.floor(idx / width);
    const i = idx * channels;
    const curR = data[i];
    const curG = data[i + 1];
    const curB = data[i + 2];
    data[i + 3] = 0;

    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nidx = ny * width + nx;
      if (visited[nidx]) continue;
      const ni = nidx * channels;
      const na = data[ni + 3];
      if (na === 0) {
        visited[nidx] = 1;
        stack.push(nidx);
        continue;
      }
      const dLocal = colorDist(data[ni], data[ni + 1], data[ni + 2], curR, curG, curB);
      const dGlobal = colorDist(data[ni], data[ni + 1], data[ni + 2], bg.r, bg.g, bg.b);
      if (dLocal <= LOCAL_THRESHOLD && dGlobal <= GLOBAL_CAP) {
        visited[nidx] = 1;
        stack.push(nidx);
      }
    }
  }

  const outPath = filePath.replace(/\.(webp|png|jpg|jpeg)$/i, ".cutout.png");
  await sharp(data, { raw: { width, height, channels } }).png().toFile(outPath);
  return outPath;
}

const files = readdirSync(DIR).filter((f) => /\.(webp|png|jpg|jpeg)$/i.test(f) && !f.includes(".cutout."));

console.log(`Processing ${files.length} images...`);
for (const f of files) {
  const full = path.join(DIR, f);
  const out = await processFile(full);
  console.log(`${f} -> ${path.basename(out)}`);
}
console.log("Done.");
