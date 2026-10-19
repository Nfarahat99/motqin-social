// Loads social credentials: process.env first (CI), then C:/mshkat/.secrets/social.env (local).
import { readFileSync, existsSync } from "node:fs";

const LOCAL_ENV = "C:/mshkat/.secrets/social.env";

export function loadEnv() {
  const env = {};
  if (existsSync(LOCAL_ENV)) {
    for (const line of readFileSync(LOCAL_ENV, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[2]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  for (const k of Object.keys(process.env)) {
    if (/^(X_|INSTAGRAM_|META_|PUBLIC_BASE_URL)/.test(k) && process.env[k]) env[k] = process.env[k];
  }
  return env;
}

export function requireKeys(env, keys) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing in social.env: ${missing.join(", ")}`);
}
