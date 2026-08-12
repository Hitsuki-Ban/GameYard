import { createGunzip } from "node:zlib";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";

const [input] = process.argv.slice(2);
if (!input) throw new Error("Usage: summarize-performance-trace.mjs <trace.json.gz>");

const chunks = [];
for await (const chunk of createReadStream(resolve(input)).pipe(createGunzip())) chunks.push(chunk);
const trace = JSON.parse(Buffer.concat(chunks).toString("utf8"));
if (!Array.isArray(trace.traceEvents)) throw new TypeError("Trace must contain traceEvents.");

const aggregates = new Map();
for (const event of trace.traceEvents) {
  if (event.ph !== "X" || !Number.isFinite(event.dur) || typeof event.name !== "string") continue;
  const key = `${event.cat ?? ""} :: ${event.name}`;
  const current = aggregates.get(key) ?? { count: 0, totalMs: 0, maxMs: 0 };
  const durationMs = event.dur / 1_000;
  current.count += 1;
  current.totalMs += durationMs;
  current.maxMs = Math.max(current.maxMs, durationMs);
  aggregates.set(key, current);
}

const result = [...aggregates.entries()]
  .map(([name, metrics]) => ({
    name,
    count: metrics.count,
    totalMs: Number(metrics.totalMs.toFixed(3)),
    maxMs: Number(metrics.maxMs.toFixed(3)),
  }))
  .sort((left, right) => right.totalMs - left.totalMs)
  .slice(0, 40);
console.log(JSON.stringify(result, null, 2));
