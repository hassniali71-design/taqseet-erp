/**
 * Post-build fixup for a real Nitro/Rolldown bug hit while deploying to Cloudflare Workers:
 * the "cloudflare-module" preset's build splits a handful of tiny bundler runtime helpers
 * (__toESM, __commonJSMin, __esmMin, __exportAll) into _ssr/createServerFn-*.mjs and has
 * every other chunk that needs them import them from there — but that chunk itself imports
 * real app code back from some of those same chunks, a genuine circular ESM dependency.
 * Node (bun run dev/build) tolerates the resulting init-order race; Cloudflare's workerd
 * runtime does not — whichever chunk's top-level code runs first sees the helper as
 * `undefined`, not a function, when it hasn't been assigned yet ("__commonJSMin is not a
 * function"). This only surfaces once the app has server functions (createServerFn) that
 * produce that chunk.
 *
 * Fix: give every consumer its own inline copy of these 4 tiny helpers instead of importing
 * them cross-chunk, so there is nothing left to race. Run automatically after `bun run
 * build` via the `postbuild` script — see package.json.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HELPER_DEFS: Record<string, string> = {
  __toESM: `var __create = Object.create;\nvar __getProtoOf = Object.getPrototypeOf;\nvar __defProp = Object.defineProperty;\nvar __getOwnPropNames = Object.getOwnPropertyNames;\nvar __getOwnPropDesc = Object.getOwnPropertyDescriptor;\nvar __hasOwnProp = Object.prototype.hasOwnProperty;\nvar __copyProps = (to, from, except, desc) => {\n\tif (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {\n\t\tkey = keys[i];\n\t\tif (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {\n\t\t\tget: ((k) => from[k]).bind(null, key),\n\t\t\tenumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable\n\t\t});\n\t}\n\treturn to;\n};\nvar __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {\n\tvalue: mod,\n\tenumerable: true\n}) : target, mod));`,
  __commonJSMin: `var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);`,
  __esmMin: `var __esmMin = (fn, res, err) => () => {\n\tif (err) throw err[0];\n\ttry {\n\t\treturn fn && (res = fn(fn = 0)), res;\n\t} catch (e) {\n\t\tthrow err = [e], e;\n\t}\n};`,
  __exportAll: `var __defProp = globalThis.__defProp ?? Object.defineProperty;\nvar __exportAll = (all, no_symbols) => {\n\tlet target = {};\n\tfor (var name in all) __defProp(target, name, {\n\t\tget: all[name],\n\t\tenumerable: true\n\t});\n\tif (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });\n\treturn target;\n};`,
};
const HELPER_NAMES = Object.keys(HELPER_DEFS);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (entry.endsWith(".mjs")) out.push(full);
  }
  return out;
}

function fixFile(path: string): boolean {
  const src = readFileSync(path, "utf8");
  // Matches: import { _ as __toESM, m as __commonJSMin } from "...createServerFn-*.mjs";
  const importLineRe =
    /^import\s*\{([^}]*)\}\s*from\s*["'][^"']*createServerFn-[^"']*\.mjs["'];\s*\n?/m;
  const match = src.match(importLineRe);
  if (!match) return false;

  const specifiers = match[1]!.split(",").map((s) => s.trim());
  const helperSpecs = specifiers.filter((s) =>
    HELPER_NAMES.some((name) => s.endsWith(`as ${name}`)),
  );
  const nonHelperSpecs = specifiers.filter((s) => !helperSpecs.includes(s));

  if (helperSpecs.length === 0) return false;

  const usedHelperNames = helperSpecs.map((s) => s.split(" as ")[1]!.trim());
  const inlineDefs = usedHelperNames.map((name) => HELPER_DEFS[name]).join("\n");

  let next = src.replace(
    importLineRe,
    nonHelperSpecs.length > 0
      ? `import { ${nonHelperSpecs.join(", ")} } from ${match[0]!.match(/from\s*("[^"]*")/)![1]};\n`
      : "",
  );
  next = `${inlineDefs}\n${next}`;
  writeFileSync(path, next);
  return true;
}

const candidates = [
  join(import.meta.dir, "..", "dist", "server"),
  join(import.meta.dir, "..", ".output", "server"),
];
const root = candidates.find((dir) => existsSync(dir));
if (!root) {
  console.log("fix-cloudflare-chunks: no server output directory found, skipping.");
  process.exit(0);
}
const files = walk(root);
let fixedCount = 0;
for (const file of files) {
  if (fixFile(file)) fixedCount += 1;
}
console.log(`fix-cloudflare-chunks: patched ${fixedCount} file(s) out of ${files.length} scanned.`);
