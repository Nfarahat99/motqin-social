// Instagram accepts only JPEG: writes publisher/public/{posts,stories}/*.jpg from the PNGs.
// The public/ folder is what gets hosted at PUBLIC_BASE_URL.
import { mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { ROOT } from "./lib/content.mjs";

const sharp = createRequire(import.meta.url)("C:/mshkat/reports/node_modules/sharp");

for (const dir of ["posts", "stories"]) {
  mkdirSync(`${ROOT}/publisher/public/${dir}`, { recursive: true });
  for (const f of readdirSync(`${ROOT}/${dir}`).filter((f) => /^[A-Z]\d+(-\d+)?\.png$/.test(f))) {
    await sharp(`${ROOT}/${dir}/${f}`).flatten({ background: "#ffffff" }).jpeg({ quality: 92, mozjpeg: true })
      .toFile(`${ROOT}/publisher/public/${dir}/${f.replace(/\.png$/, ".jpg")}`);
    console.log(`${dir}/${f} → jpg`);
  }
}
