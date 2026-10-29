/**
 * بيولّد عامل الخدمة (.output/public/sw.js) بعد البناء (بند 79):
 *   • قايمة كل ملفات البرنامج في .output/public/assets + الأيقونات والـmanifest.
 *   • قايمة الصفحات الثابتة من src/routes (من غير الصفحات اللي فيها رقم زي /contracts/$id).
 *   • رقم النسخة = بصمة أسماء الملفات (بتتغيّر مع أي بناء فيه تغيير) — ده اللي بيطلّع رسالة
 *     "فيه تحديث" عند المستخدم.
 * وبيضيف لـ_headers إن sw.js ميتحفظش في الكاش، عشان النسخة الجديدة توصل على طول.
 * بيشتغل في postbuild بعد fix-cloudflare-chunks وcheck-no-secrets-in-bundle.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const publicDir = join(root, ".output", "public");
if (!existsSync(publicDir)) {
  console.error("build-sw: .output/public مش موجود — شغّل البناء الأول");
  process.exit(1);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const assets = walk(publicDir)
  .map((f) => "/" + relative(publicDir, f).split("\\").join("/"))
  .filter(
    (p) => p.startsWith("/assets/") || p.startsWith("/icons/") || p === "/manifest.webmanifest",
  )
  .sort();

const pages = readdirSync(join(root, "src", "routes"))
  .filter(
    (f) =>
      f.endsWith(".tsx") && !f.includes("$") && !f.startsWith("__") && !f.startsWith("platform"),
  )
  .map((f) => f.replace(/\.tsx$/, ""))
  .map((name) =>
    name === "index"
      ? "/"
      : "/" +
        name
          .split(".")
          .map((s) => s.replace(/_$/, ""))
          .join("/"),
  )
  .sort();

const version = createHash("sha256").update(assets.join("\n")).digest("hex").slice(0, 12);
const template = readFileSync(join(root, "scripts", "sw-template.js"), "utf8");
const sw = template
  .replace("__VERSION__", version)
  .replace("__ASSETS__", JSON.stringify(assets))
  .replace("__PAGES__", JSON.stringify(pages));
writeFileSync(join(publicDir, "sw.js"), sw);

const headersPath = join(publicDir, "_headers");
const headers = existsSync(headersPath) ? readFileSync(headersPath, "utf8") : "";
if (!headers.includes("/sw.js")) {
  writeFileSync(
    headersPath,
    `${headers.trimEnd()}\n/sw.js\n  cache-control: no-cache, no-store, must-revalidate\n/manifest.webmanifest\n  cache-control: no-cache\n`,
  );
}
console.log(`build-sw: نسخة ${version} — ${assets.length} ملف، ${pages.length} صفحة`);
