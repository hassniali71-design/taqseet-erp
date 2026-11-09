/**
 * مفاتيح إشعارات الستارة (بند 84) — بيتشغّل مرة واحدة على جهاز المالك، مش على السيرفر ومش في الريبو.
 *
 *   bun run scripts/setup-push-keys.ts --site https://عنوان-البرنامج
 *   bun run scripts/setup-push-keys.ts --site https://عنوان-البرنامج --upload
 *
 * بيعمل إيه:
 *  1. لو مفيش ملف مفاتيح: بيعمل زوج مفاتيح VAPID جديد لحسبة لوحدها + كلمة سر PUSH_SECRET، ويكتبهم في
 *     ..\_keys\push-vapid-taqseet.env (فولدر _keys جنب فولدر المشروع — برة الريبو). لو الملف موجود
 *     بيستعمله زي ما هو (عشان التليفونات اللي فعّلت متتلخبطش).
 *  2. بيكتب ..\_keys\push-config-taqseet.sql: ملف صغير للمالك يطبّقه بعد ملف 0033 (فيه كلمة السر
 *     وعنوان الموقع + /push/dispatch). آخر سطر فيه COMMIT;
 *  3. بيحط VITE_PUSH_PUBLIC_KEY (المفتاح العام — مش سر) في .env بتاع المشروع، عشان البناء الجاي يشيله.
 *  4. مع --upload: بيبعت الأسرار التلاتة للـWorker بـ wrangler secret put من الملف على طول.
 *
 * **عمره ما بيطبع أي سر.** بيطبع المفتاح العام بس.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const root = resolve(import.meta.dir, "..");
const keysDir = resolve(arg("--keys-dir") ?? join(root, "..", "_keys"));
const envFile = join(keysDir, "push-vapid-taqseet.env");
const sqlFile = join(keysDir, "push-config-taqseet.sql");
const site = (arg("--site") ?? "").replace(/\/+$/, "");

if (!/^https:\/\/[^/\s]+$/.test(site)) {
  console.error("لازم تكتب عنوان البرنامج: --site https://العنوان (من غير / في الآخر)");
  process.exit(1);
}

const b64url = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function readEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m?.[1]) out[m[1]] = m[2] ?? "";
  }
  return out;
}

let keys: Record<string, string>;
if (existsSync(envFile)) {
  keys = readEnv(envFile);
  console.log(`ملف المفاتيح موجود — هستعمله زي ما هو: ${envFile}`);
} else {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  keys = {
    VAPID_PUBLIC_KEY: b64url(pub),
    VAPID_PRIVATE_KEY: jwk.d as string,
    PUSH_SECRET: b64url(crypto.getRandomValues(new Uint8Array(32))),
  };
  mkdirSync(keysDir, { recursive: true });
  writeFileSync(
    envFile,
    `# مفاتيح إشعارات حسبة — سري. ماتبعتهوش لحد وماترفعهوش على جيت هب.\n${Object.entries(keys)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n")}\n`,
  );
  console.log(`اتعمل ملف مفاتيح جديد: ${envFile}`);
}

for (const k of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "PUSH_SECRET"]) {
  if (!keys[k]) {
    console.error(`ملف المفاتيح ناقص ${k} — امسحه وشغّل السكريبت تاني`);
    process.exit(1);
  }
}

// ملف الإعداد للقاعدة (بيتطبّق بعد 0033)
const secret = keys["PUSH_SECRET"] as string;
writeFileSync(
  sqlFile,
  `-- إعداد إشعارات حسبة (بعد ملف 0033). سري: فيه كلمة السر — ماتبعتهوش لحد.\n` +
    `-- آخر سطر لازم يكون COMMIT;\nBEGIN;\n` +
    `INSERT INTO public.push_config (id, dispatch_url, secret) VALUES (1, '${site}/push/dispatch', '${secret}')\n` +
    `ON CONFLICT (id) DO UPDATE SET dispatch_url = EXCLUDED.dispatch_url, secret = EXCLUDED.secret, updated_at = now();\n` +
    `COMMIT;\n`,
);
console.log(`اتعمل ملف إعداد القاعدة: ${sqlFile}`);

// المفتاح العام في .env بتاع المشروع (مش سر)
const projectEnv = join(root, ".env");
const line = `VITE_PUSH_PUBLIC_KEY=${keys["VAPID_PUBLIC_KEY"]}`;
const current = existsSync(projectEnv) ? readFileSync(projectEnv, "utf8") : "";
const next = /^VITE_PUSH_PUBLIC_KEY=.*$/m.test(current)
  ? current.replace(/^VITE_PUSH_PUBLIC_KEY=.*$/m, line)
  : `${current}${current && !current.endsWith("\n") ? "\n" : ""}${line}\n`;
mkdirSync(dirname(projectEnv), { recursive: true });
writeFileSync(projectEnv, next);
console.log(`المفتاح العام اتحط في .env: ${keys["VAPID_PUBLIC_KEY"]}`);

if (args.includes("--upload")) {
  const wranglerConfig = join(root, ".output", "server", "wrangler.json");
  if (!existsSync(wranglerConfig)) {
    console.error(
      "اعمل bun run build الأول (محتاج .output/server/wrangler.json عشان أعرف اسم الـWorker)",
    );
    process.exit(1);
  }
  for (const name of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "PUSH_SECRET"]) {
    const proc = Bun.spawn(
      ["bunx", "wrangler", "secret", "put", name, "--config", wranglerConfig],
      {
        stdin: new TextEncoder().encode(keys[name] as string),
        stdout: "ignore",
        stderr: "pipe",
      },
    );
    const code = await proc.exited;
    if (code !== 0) {
      console.error(`ماقدرتش أرفع ${name} (اتأكد إنك داخل على كلاود فلير بـ bunx wrangler login)`);
      console.error((await new Response(proc.stderr).text()).replace(/[A-Za-z0-9_-]{40,}/g, "***"));
      process.exit(1);
    }
    console.log(`اترفع ${name} على الـWorker ✅`);
  }
}

console.log("\nخلصنا. الخطوة الجاية: bun run deploy (عشان البرنامج ياخد المفتاح العام).");
