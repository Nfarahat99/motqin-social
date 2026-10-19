// X API v2 client: OAuth 1.0a user context (own account), image upload, posting.
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const API = "https://api.x.com";

const pct = (s) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

function authHeader(env, method, url, extraParams = {}) {
  const oauth = {
    oauth_consumer_key: env.X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: env.X_ACCESS_TOKEN,
    oauth_version: "1.0",
  };
  const u = new URL(url);
  const params = { ...oauth, ...extraParams };
  for (const [k, v] of u.searchParams) params[k] = v;
  const base = Object.keys(params)
    .sort()
    .map((k) => `${pct(k)}=${pct(params[k])}`)
    .join("&");
  const baseString = [method.toUpperCase(), pct(u.origin + u.pathname), pct(base)].join("&");
  const key = `${pct(env.X_API_SECRET)}&${pct(env.X_ACCESS_TOKEN_SECRET)}`;
  oauth.oauth_signature = crypto.createHmac("sha1", key).update(baseString).digest("base64");
  return "OAuth " + Object.keys(oauth).sort().map((k) => `${pct(k)}="${pct(oauth[k])}"`).join(", ");
}

async function call(env, method, url, { json, form } = {}) {
  const headers = { Authorization: authHeader(env, method, url) };
  let body;
  if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    body = form; // multipart: body params are excluded from the OAuth signature
  }
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`X ${method} ${new URL(url).pathname} → ${res.status}: ${text.slice(0, 500)}`);
  return data;
}

export const xMe = (env) => call(env, "GET", `${API}/2/users/me`);

export async function xUploadImage(env, path) {
  const form = new FormData();
  form.append("media", new Blob([readFileSync(path)], { type: "image/png" }), basename(path));
  form.append("media_category", "tweet_image");
  const data = await call(env, "POST", `${API}/2/media/upload`, { form });
  return data.data?.id ?? data.id ?? data.media_id_string;
}

export async function xPost(env, text, imagePaths = [], replyToId, poll) {
  const mediaIds = [];
  for (const p of imagePaths.slice(0, 4)) mediaIds.push(await xUploadImage(env, p));
  const payload = { text };
  if (mediaIds.length) payload.media = { media_ids: mediaIds };
  if (poll) payload.poll = { options: poll, duration_minutes: 3 * 24 * 60 }; // X forbids media + poll together
  if (replyToId) payload.reply = { in_reply_to_tweet_id: replyToId };
  const data = await call(env, "POST", `${API}/2/tweets`, { json: payload });
  return data.data; // { id, text }
}
