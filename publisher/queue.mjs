// Builds publisher/queue.json — the only content the public repo carries: the automatable
// calendar rows with their final text. Internal docs (captions notes, plan) stay local.
//   node queue.mjs   (run after editing POSTS-CAPTIONS.md or CONTENT-CALENDAR.csv, then commit)
import { writeFileSync } from "node:fs";
import { loadCaptions, loadCalendar, assetFiles, ROOT } from "./lib/content.mjs";

const captions = loadCaptions();
const cleanRef = (ref) => (ref.match(/^[A-Z]+\d+(?:-[A-Z]+)?/) ?? [ref])[0];
const queue = [];
const skipped = [];

for (const r of loadCalendar().filter((r) => /^(X|Instagram|Instagram Stories)$/.test(r.platform))) {
  const files = assetFiles(r.asset_id).map((f) => f.slice(ROOT.length + 1));
  const cap = r.platform === "Instagram Stories" ? { parts: [] } : captions[cleanRef(r.caption_ref)];
  const why =
    (r.platform !== "X" && !files.length && "no image") ||
    (!cap && "no caption") ||
    (cap.parts.some((p) => /\[[^\]]+\]/.test(p)) && "unfilled [placeholder]");
  if (why) { skipped.push(`${r.date} ${r.platform} ${r.asset_id}: ${why}`); continue; }
  queue.push({
    key: `${r.date}|${r.platform}|${r.asset_id}`,
    date: r.date, time_ksa: r.time_ksa, platform: r.platform,
    asset_id: r.asset_id, caption_ref: r.caption_ref,
    parts: cap.parts, poll: cap.poll, files,
  });
}

writeFileSync(`${ROOT}/publisher/queue.json`, JSON.stringify(queue, null, 2));
console.log(`queue.json: ${queue.length} items · skipped ${skipped.length}`);
for (const s of skipped) console.log(`  - ${s}`);
