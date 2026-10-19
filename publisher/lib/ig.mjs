// Instagram API with Instagram Login (graph.instagram.com): feed image, carousel, story.
// Instagram fetches media itself, so every image must be a public HTTPS JPEG URL.
const API = "https://graph.instagram.com/v23.0";

async function call(env, method, path, params = {}) {
  const url = new URL(API + path);
  const body = new URLSearchParams({ ...params, access_token: env.INSTAGRAM_ACCESS_TOKEN });
  let res;
  if (method === "GET") {
    for (const [k, v] of body) url.searchParams.set(k, v);
    res = await fetch(url);
  } else {
    res = await fetch(url, { method, body });
  }
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`IG ${method} ${path} → ${res.status}: ${JSON.stringify(data.error ?? data)}`);
  return data;
}

export const igMe = (env) => call(env, "GET", "/me", { fields: "user_id,username,account_type,media_count" });

async function waitReady(env, containerId) {
  for (let i = 0; i < 30; i++) {
    const { status_code } = await call(env, "GET", `/${containerId}`, { fields: "status_code" });
    if (status_code === "FINISHED") return;
    if (status_code === "ERROR" || status_code === "EXPIRED") throw new Error(`IG container ${containerId} ${status_code}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`IG container ${containerId} not ready after 90s`);
}

async function publish(env, userId, containerId) {
  await waitReady(env, containerId);
  const { id } = await call(env, "POST", `/${userId}/media_publish`, { creation_id: containerId });
  return id;
}

export async function igPostImage(env, userId, imageUrl, caption) {
  const { id } = await call(env, "POST", `/${userId}/media`, { image_url: imageUrl, caption });
  return publish(env, userId, id);
}

export async function igPostCarousel(env, userId, imageUrls, caption) {
  const children = [];
  for (const image_url of imageUrls) {
    const { id } = await call(env, "POST", `/${userId}/media`, { image_url, is_carousel_item: "true" });
    children.push(id);
  }
  for (const c of children) await waitReady(env, c);
  const { id } = await call(env, "POST", `/${userId}/media`, {
    media_type: "CAROUSEL",
    children: children.join(","),
    caption,
  });
  return publish(env, userId, id);
}

export async function igPostStory(env, userId, imageUrl) {
  const { id } = await call(env, "POST", `/${userId}/media`, { image_url: imageUrl, media_type: "STORIES" });
  return publish(env, userId, id);
}

// Long-lived tokens last 60 days; refreshing returns a fresh 60-day token.
export async function igRefreshToken(env) {
  const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${env.INSTAGRAM_ACCESS_TOKEN}`;
  const data = await (await fetch(url)).json();
  if (data.error) throw new Error(`IG refresh → ${JSON.stringify(data.error)}`);
  return data; // { access_token, expires_in }
}
