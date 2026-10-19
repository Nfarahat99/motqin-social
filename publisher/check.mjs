// Verifies X and Instagram credentials without posting anything.
import { loadEnv } from "./lib/env.mjs";
import { xMe } from "./lib/x.mjs";
import { igMe } from "./lib/ig.mjs";
import { loadCaptions, loadCalendar, assetFiles } from "./lib/content.mjs";

const env = loadEnv();

try {
  const me = await xMe(env);
  console.log(`X ✓ @${me.data.username} (${me.data.name})`);
} catch (e) {
  console.log(`X ✗ ${e.message}`);
}

try {
  const me = await igMe(env);
  console.log(`Instagram ✓ @${me.username} · ${me.account_type} · user_id ${me.user_id} · ${me.media_count} posts`);
} catch (e) {
  console.log(`Instagram ✗ ${e.message}`);
}

const captions = loadCaptions();
const cal = loadCalendar().filter((r) => /^(X|Instagram|Instagram Stories)$/.test(r.platform));
const ref = (r) => (r.caption_ref.match(/^[A-Z]+\d+(?:-[A-Z]+)?/) ?? [r.caption_ref])[0];
const problems = cal.filter((r) => {
  const hasImg = assetFiles(r.asset_id).length > 0;
  if (r.platform === "Instagram Stories") return !hasImg;
  if (r.platform === "X") return !captions[ref(r)]; // X may post text-only
  return !hasImg || !captions[ref(r)];
});
console.log(`Captions parsed: ${Object.keys(captions).length} · automatable calendar rows: ${cal.length} · rows needing manual handling: ${problems.length}`);
for (const p of problems) console.log(`  - ${p.date} ${p.platform} ${p.asset_id} ${p.caption_ref}`);
