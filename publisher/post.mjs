// Publishes queue.json items to X / Instagram.
//   node post.mjs --list                      show items and their status (✓ done, … partial)
//   node post.mjs --ref P01-X [--go]          one item by caption ref (dry run unless --go)
//   node post.mjs --due [--go] [--max-late 24] every item whose KSA time has passed, not yet published
// Published items are recorded in published.json (each tweet as it lands) so nothing posts twice.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { loadEnv } from "./lib/env.mjs";
import { xPost } from "./lib/x.mjs";
import { igMe, igPostImage, igPostCarousel, igPostStory } from "./lib/ig.mjs";
import { publicJpegUrls, ROOT } from "./lib/content.mjs";

const LOG = `${ROOT}/publisher/published.json`;
const args = process.argv.slice(2);
const go = args.includes("--go");
const argVal = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
// --due only catches up on items at most this many hours late, so an outage never floods the feed.
// 24h because GitHub runs the */15 schedule only every 3-5 hours in practice; 6h risked silently skipping posts.
const MAX_LATE_HOURS = Number(argVal("--max-late") ?? 24);

const env = loadEnv();
const queue = JSON.parse(readFileSync(`${ROOT}/publisher/queue.json`, "utf8"));
const log = existsSync(LOG) ? JSON.parse(readFileSync(LOG, "utf8")) : {};
const isDone = (q) => log[q.key] && !log[q.key].partial;
const ksaTime = (q) => new Date(`${q.date}T${q.time_ksa}:00+03:00`);
const saveLog = () => writeFileSync(LOG, JSON.stringify(log, null, 2));

function utm(text, platform, assetId) {
  const src = platform.startsWith("Instagram") ? "instagram" : "x";
  return text.replace(/(?<![\w/])motqinsystem\.com(?![\w/?])/g, `motqinsystem.com/?utm_source=${src}&utm_medium=social&utm_campaign=launch-oct26&utm_content=${assetId}`);
}

function validate(q) {
  if (q.platform === "X") {
    for (const p of q.parts) {
      const len = [...utm(p, "X", q.asset_id).replace(/\S*motqinsystem\.com\S*/g, "x".repeat(23))].length;
      if (len > 280) throw new Error(`X text ${len}/280 chars in ${q.caption_ref}`);
    }
  } else if ([...q.parts.join("\n\n")].length > 2200) {
    throw new Error(`Instagram caption over 2200 chars in ${q.caption_ref}`);
  }
}

async function publish(q) {
  validate(q);
  const files = q.files.map((f) => `${ROOT}/${f}`);
  console.log(`\n── ${q.date} ${q.time_ksa} · ${q.platform} · ${q.asset_id} (${files.length} image(s))`);
  q.parts.forEach((p, i) => console.log(q.parts.length > 1 ? `[${i + 1}] ${p}` : p));
  if (q.poll) console.log(`poll: ${q.poll.join(" · ")}`);
  if (!go) return console.log("(dry run — add --go to publish)");

  let id;
  if (q.platform === "X") {
    // Thread: carousel slides go one per tweet; otherwise images ride on the first tweet.
    // A poll can't carry media, so its design follows as the first reply.
    const perTweet = q.parts.length > 1 && files.length === q.parts.length;
    const steps = q.parts.map((text, i) => ({
      text,
      imgs: q.poll ? [] : perTweet ? [files[i]] : i === 0 ? files : [],
      poll: i === 0 ? q.poll : undefined,
    }));
    if (q.poll && files.length) steps.push({ text: "", imgs: files });
    const progress = (log[q.key] ??= { partial: true, ids: [] });
    for (let i = progress.ids.length; i < steps.length; i++) {
      const s = steps[i];
      const t = await xPost(env, utm(s.text, "X", q.asset_id), s.imgs, progress.ids.at(-1), s.poll);
      progress.ids.push(t.id);
      saveLog();
    }
    id = progress.ids[0];
  } else {
    const caption = q.parts.join("\n\n");
    const { user_id } = await igMe(env);
    const urls = publicJpegUrls(env, files);
    if (q.platform === "Instagram Stories") id = await igPostStory(env, user_id, urls[0]);
    else if (urls.length > 1) id = await igPostCarousel(env, user_id, urls, caption);
    else id = await igPostImage(env, user_id, urls[0], caption);
  }
  log[q.key] = { id, ids: log[q.key]?.ids, at: new Date().toISOString() };
  saveLog();
  console.log(`✓ published ${id}`);
}

if (args.includes("--list")) {
  for (const q of queue) console.log(`${isDone(q) ? "✓" : log[q.key] ? "…" : " "} ${q.date} ${q.time_ksa} ${q.platform.padEnd(17)} ${q.asset_id.padEnd(5)} ${q.caption_ref}`);
} else if (argVal("--ref")) {
  const ref = argVal("--ref");
  const q = queue.find((x) => x.caption_ref === ref || `${x.asset_id}-${x.platform}` === ref);
  if (!q) throw new Error(`no queue item for ${ref}`);
  if (isDone(q)) console.log(`already published: ${JSON.stringify(log[q.key])}`);
  else await publish(q);
} else if (args.includes("--due")) {
  const now = Date.now();
  const late = (q) => (now - ksaTime(q).getTime()) / 3.6e6;
  // A platform without credentials yet (e.g. X before its keys arrive) is left waiting, not failed.
  const ready = (q) => (q.platform === "X" ? !!env.X_API_KEY && env.X_PAUSED !== "1" : !!env.INSTAGRAM_ACCESS_TOKEN);
  const pending = queue.filter((q) => !isDone(q) && late(q) >= 0 && ready(q));
  for (const q of pending.filter((q) => late(q) > MAX_LATE_HOURS)) console.log(`skipped (>${MAX_LATE_HOURS}h late): ${q.key}`);
  const due = pending.filter((q) => late(q) <= MAX_LATE_HOURS);
  console.log(`${due.length} due item(s)`);
  let failed = 0;
  for (const q of due) {
    try { await publish(q); } catch (e) { failed++; console.error(`✗ ${q.key}: ${e.message}`); }
  }
  if (failed) process.exitCode = 1;
} else {
  console.log("usage: --list | --ref <P01-X> [--go] | --due [--go] [--max-late 24]");
}
