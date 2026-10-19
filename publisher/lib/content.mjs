// Reads the campaign: captions (POSTS-CAPTIONS.md), calendar (CONTENT-CALENDAR.csv), asset files.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Campaign root = two levels above this file (works locally and in CI).
export const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replaceAll("\\", "/").replace(/\/$/, "");

// ref → { parts: [tweet1, tweet2, …], poll?: [options] }. Several ```text blocks under one
// heading form a thread; a «خيارات الاستطلاع:» line with `quoted` options makes an X poll.
export function loadCaptions() {
  const md = readFileSync(`${ROOT}/POSTS-CAPTIONS.md`, "utf8");
  const map = {};
  const sections = md.split(/^(?=#{2,4}\s)/m);
  for (const sec of sections) {
    const h = sec.match(/^#{3,4}\s+([A-Z]+\d+(?:-[A-Z]+)?)\b/);
    if (!h) continue;
    const parts = [...sec.matchAll(/```text\r?\n([\s\S]*?)\r?\n```/g)].map((m) => m[1].trim());
    if (!parts.length) continue;
    const pollLine = sec.match(/خيارات الاستطلاع:(.*)/);
    const poll = pollLine ? [...pollLine[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]) : undefined;
    map[h[1]] = { parts, poll };
  }
  return map;
}

export function loadCalendar() {
  const lines = readFileSync(`${ROOT}/CONTENT-CALENDAR.csv`, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const head = lines.shift().split(",");
  return lines.map((l) => {
    const cells = l.split(",");
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}

// Local image files for an asset id; carousels expand to their slides.
export function assetFiles(assetId) {
  if (/^C\d+$/.test(assetId)) {
    const files = [];
    for (let i = 1; existsSync(`${ROOT}/posts/${assetId}-${i}.png`); i++) files.push(`${ROOT}/posts/${assetId}-${i}.png`);
    return files;
  }
  for (const dir of ["posts", "stories", "accounts"]) {
    const f = `${ROOT}/${dir}/${assetId}.png`;
    if (existsSync(f)) return [f];
  }
  return [];
}

export function publicJpegUrls(env, files) {
  if (!env.PUBLIC_BASE_URL) throw new Error("PUBLIC_BASE_URL not set — Instagram needs public image URLs");
  return files.map((f) => `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/${f.split("/").slice(-2).join("/").replace(/\.png$/, ".jpg")}`);
}
