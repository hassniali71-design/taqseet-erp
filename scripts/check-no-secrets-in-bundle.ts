/**
 * Post-build guard: fail the build (and therefore `bun run deploy`) if any server secret can
 * reach the browser. Added after a real incident (docs/reports/BASELINE-2026-10-09.md, C1): a
 * `VITE_SUPABASE_SERVICE_ROLE_KEY` line in the local .env made Vite inline the service-role key
 * into the public client bundle — and it shipped to production unnoticed. That key bypasses RLS
 * for every tenant.
 *
 * Checks:
 *  1. No env var named VITE_* containing SERVICE / SECRET / PRIVATE (Vite exposes every VITE_*
 *     var to client code, so the name alone is the bug — even if no code reads it).
 *  2. No Supabase secret key (`sb_secret_…`) anywhere in the client output.
 *  3. No legacy Supabase JWT whose payload role is `service_role` in the client output.
 *  4. The literal value of any server-only secret env var is not in the client output.
 *
 * NEVER prints a secret value — only env var names and file paths. Runs automatically after
 * `bun run build` via the `postbuild` script — see package.json.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const projectRoot = join(import.meta.dir, "..");
const problems: string[] = [];

// 1. Secret-looking names exposed to the client via the VITE_ prefix (bun auto-loads .env).
const SECRET_NAME_RE = /SERVICE|SECRET|PRIVATE/i;
for (const name of Object.keys(process.env)) {
  if (name.startsWith("VITE_") && SECRET_NAME_RE.test(name)) {
    problems.push(
      `env var ${name}: a VITE_ variable with a secret-looking name is inlined into browser code — remove it (server code must read the non-VITE_ name).`,
    );
  }
}

// Values of server-only secrets, to search for verbatim in the client output.
const SERVER_SECRET_NAME_RE = /SERVICE_ROLE|SECRET|AUTH_TOKEN|PRIVATE/i;
const serverSecrets = Object.entries(process.env).filter(
  (entry): entry is [string, string] =>
    !entry[0].startsWith("VITE_") &&
    SERVER_SECRET_NAME_RE.test(entry[0]) &&
    typeof entry[1] === "string" &&
    entry[1].length >= 16,
);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(m?js|html|json|map|css|txt)$/.test(entry)) out.push(full);
  }
  return out;
}

function hasServiceRoleJwt(src: string): boolean {
  const jwtRe = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;
  for (const match of src.matchAll(jwtRe)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1]!, "base64url").toString("utf8")) as {
        role?: unknown;
      };
      if (payload.role === "service_role") return true;
    } catch {
      // Not a decodable JWT payload — ignore.
    }
  }
  return false;
}

const clientDirs = [join(projectRoot, ".output", "public"), join(projectRoot, "dist", "client")];
const clientRoot = clientDirs.find((dir) => existsSync(dir));
if (!clientRoot) {
  console.log(
    "check-no-secrets-in-bundle: no client output directory found, skipping bundle scan.",
  );
} else {
  const files = walk(clientRoot);
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const where = relative(projectRoot, file);
    if (/sb_secret_[A-Za-z0-9]/.test(src)) {
      problems.push(`${where}: contains a Supabase secret key (sb_secret_…).`);
    }
    if (hasServiceRoleJwt(src)) {
      problems.push(`${where}: contains a Supabase JWT with role "service_role".`);
    }
    for (const [name, value] of serverSecrets) {
      if (src.includes(value)) problems.push(`${where}: contains the value of ${name}.`);
    }
  }
  if (problems.length === 0) {
    console.log(
      `check-no-secrets-in-bundle: OK — ${files.length} client file(s) scanned, no secrets found.`,
    );
  }
}

if (problems.length > 0) {
  console.error("check-no-secrets-in-bundle: FAILED — server secrets would reach the browser:");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("Do NOT deploy this build. See docs/reports/BASELINE-2026-10-09.md (C1).");
  process.exit(1);
}
