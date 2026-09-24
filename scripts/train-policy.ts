/**
 * Trains the learned card policy (src/ai/policy.ts) on self-play data from scripts/selfplay.ts.
 *
 * Each decision is a list of legal cards (feature rows) and the search's target probabilities.
 * The network scores every card, a softmax over the legal cards turns the scores into a
 * choice, and it learns by cross-entropy against the search's probabilities (Adam).
 *
 *   npx vite-node scripts/train-policy.ts -- --data a.jsonl,b.jsonl --out src/ai/policy-weights.json [--hidden 24 --epochs 10]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { FEATURE_COUNT, type PolicyWeights } from "../src/ai/policy";
import { mulberry32 } from "../src/engine/rng";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const files = arg("data", "selfplay.jsonl").split(",");
const out = arg("out", "src/ai/policy-weights.json");
const H = Number(arg("hidden", "24"));
const epochs = Number(arg("epochs", "10"));
const lr = Number(arg("lr", "0.003"));
const batch = Number(arg("batch", "64"));
const rand = mulberry32(Number(arg("seed", "7")));

type Decision = { f: number[][]; t: number[] };
const data: Decision[] = files.flatMap((file) =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Decision),
);
for (let i = data.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [data[i], data[j]] = [data[j], data[i]];
}
const nVal = Math.floor(data.length * 0.1);
const val = data.slice(0, nVal);
const train = data.slice(nVal);
const D = FEATURE_COUNT;
console.log(`${data.length} decisions (${train.length} train, ${val.length} held out), ${D} features, ${H} hidden units`);

// Feature scaling from the training rows.
const mean = new Array(D).fill(0);
const sq = new Array(D).fill(0);
let rows = 0;
for (const d of train) for (const f of d.f) {
  rows++;
  for (let i = 0; i < D; i++) {
    mean[i] += f[i];
    sq[i] += f[i] * f[i];
  }
}
for (let i = 0; i < D; i++) mean[i] /= rows;
const std = mean.map((m, i) => Math.max(0.05, Math.sqrt(sq[i] / rows - m * m)));
const norm = (f: number[]) => f.map((x, i) => (x - mean[i]) / std[i]);
const trainN = train.map((d) => ({ f: d.f.map(norm), t: d.t }));
const valN = val.map((d) => ({ f: d.f.map(norm), t: d.t }));

// Parameters, flattened: w1 (H×D), b1 (H), w2 (H), b2.
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const w1 = Array.from({ length: H }, () => Array.from({ length: D }, () => gauss() * Math.sqrt(1 / D)));
const b1 = new Array(H).fill(0);
const w2 = Array.from({ length: H }, () => gauss() * Math.sqrt(1 / H));
let b2 = 0;
const params = () => [...w1.flat(), ...b1, ...w2, b2];
const P = H * D + H + H + 1;
const m = new Float64Array(P), v = new Float64Array(P);
let step = 0;

function forward(f: number[]) {
  const a = new Array(H);
  let s = b2;
  for (let h = 0; h < H; h++) {
    let z = b1[h];
    const row = w1[h];
    for (let i = 0; i < D; i++) z += row[i] * f[i];
    a[h] = Math.tanh(z);
    s += w2[h] * a[h];
  }
  return { a, s };
}

function evaluate(set: typeof valN) {
  let loss = 0, agree = 0;
  for (const d of set) {
    const s = d.f.map((f) => forward(f).s);
    const top = Math.max(...s);
    const e = s.map((x) => Math.exp(x - top));
    const z = e.reduce((p, q) => p + q, 0);
    d.t.forEach((t, i) => (loss -= t > 0 ? t * Math.log(e[i] / z + 1e-12) : 0));
    const pick = s.indexOf(top);
    if (d.t[pick] === Math.max(...d.t)) agree++;
  }
  return { loss: loss / set.length, agree: agree / set.length };
}

for (let epoch = 1; epoch <= epochs; epoch++) {
  for (let i = trainN.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [trainN[i], trainN[j]] = [trainN[j], trainN[i]];
  }
  for (let start = 0; start < trainN.length; start += batch) {
    const g = new Float64Array(P);
    const chunk = trainN.slice(start, start + batch);
    for (const d of chunk) {
      const fw = d.f.map(forward);
      const top = Math.max(...fw.map((x) => x.s));
      const e = fw.map((x) => Math.exp(x.s - top));
      const z = e.reduce((p, q) => p + q, 0);
      fw.forEach((x, c) => {
        const ds = e[c] / z - d.t[c]; // d(cross-entropy)/d(score)
        if (ds === 0) return;
        const f = d.f[c];
        for (let h = 0; h < H; h++) {
          g[H * D + H + h] += ds * x.a[h];
          const dz = ds * w2[h] * (1 - x.a[h] * x.a[h]);
          g[H * D + h] += dz;
          const base = h * D;
          for (let i = 0; i < D; i++) g[base + i] += dz * f[i];
        }
        g[P - 1] += ds;
      });
    }
    // Adam
    step++;
    const b1c = 1 - 0.9 ** step, b2c = 1 - 0.999 ** step;
    const flat = params();
    for (let k = 0; k < P; k++) {
      const gk = g[k] / chunk.length;
      m[k] = 0.9 * m[k] + 0.1 * gk;
      v[k] = 0.999 * v[k] + 0.001 * gk * gk;
      flat[k] -= (lr * (m[k] / b1c)) / (Math.sqrt(v[k] / b2c) + 1e-8);
    }
    for (let h = 0; h < H; h++) for (let i = 0; i < D; i++) w1[h][i] = flat[h * D + i];
    for (let h = 0; h < H; h++) b1[h] = flat[H * D + h];
    for (let h = 0; h < H; h++) w2[h] = flat[H * D + H + h];
    b2 = flat[P - 1];
  }
  const tr = evaluate(trainN.slice(0, valN.length));
  const va = evaluate(valN);
  console.log(`epoch ${epoch}: train loss ${tr.loss.toFixed(3)} agree ${(100 * tr.agree).toFixed(1)}% | held-out loss ${va.loss.toFixed(3)} agree ${(100 * va.agree).toFixed(1)}%`);
}

const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
const weights: PolicyWeights = {
  w1: w1.map((row) => row.map(r5)),
  b1: b1.map(r5),
  w2: w2.map(r5),
  b2: r5(b2),
  mean: mean.map(r5),
  std: std.map(r5),
};
writeFileSync(out, JSON.stringify(weights));
console.log(`weights → ${out}`);
