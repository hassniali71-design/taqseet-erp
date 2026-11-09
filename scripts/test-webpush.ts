/* eslint-disable @typescript-eslint/no-explicit-any -- اختبار بتليفون وهمي (منقول زي ما هو من دكانة/سفرة) */
/**
 * Web Push sending (src/lib/webpush.ts + src/lib/push-dispatch.ts), checked end to end without a phone:
 *  - we play the phone: decrypt the message with the phone's own keys (RFC 8291) and get the text back;
 *  - the VAPID signature verifies with our public key, and is addressed to the push service;
 *  - /push/dispatch refuses a wrong secret, works out which phones are gone, and asks the DB to forget them;
 *  - only known push services are called, and a link can only point inside the app.
 * Run: bun run scripts/test-webpush.ts
 */
import {
  b64urlDecode,
  b64urlEncode,
  encryptPayload,
  isAllowedEndpoint,
  vapidAuthorization,
} from "../src/lib/webpush";
import { handlePushDispatch, isPushDispatchRequest, safeEqual } from "../src/lib/push-dispatch";

const checks: [string, boolean, unknown][] = [];
const enc = new TextEncoder();
const dec = new TextDecoder();

async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, new Uint8Array([...info, 1]));
  return okm.slice(0, len);
}

// ---- a pretend phone (user agent) with its own keys
const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
  "deriveBits",
])) as CryptoKeyPair;
const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
const authSecret = crypto.getRandomValues(new Uint8Array(16));
const sub = { p256dh: b64urlEncode(uaPublic), auth: b64urlEncode(authSecret) };

/** what the phone does on receipt (RFC 8291 §3.4) */
async function phoneDecrypt(body: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey(
    "raw",
    asPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: asKey } as any, ua.privateKey, 256),
  );
  const ikm = await hkdf(
    authSecret,
    shared,
    new Uint8Array([...enc.encode("WebPush: info\0"), ...uaPublic, ...asPublic]),
    32,
  );
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, k, cipher),
  );
  if (plain[plain.length - 1] !== 2) throw new Error("missing last-record delimiter");
  return dec.decode(plain.slice(0, -1));
}

// ---- 1. encryption round trip (Arabic text survives)
const text = JSON.stringify({
  title: "بيعة جديدة 🧾",
  body: "فاتورة INV-1 — 250 ج.م",
  url: "/sales",
});
const body = await encryptPayload(enc.encode(text), sub);
checks.push([
  "header: rs = 4096",
  new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0) === 4096,
  null,
]);
checks.push(["header: server key 65 bytes", body[20] === 65, body[20]]);
checks.push(["phone decrypts the same text", (await phoneDecrypt(body)) === text, null]);
const body2 = await encryptPayload(enc.encode(text), sub);
checks.push([
  "each message encrypted differently",
  b64urlEncode(body) !== b64urlEncode(body2),
  null,
]);

// ---- 2. VAPID signature
const vk = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
])) as CryptoKeyPair;
const vPub = new Uint8Array(await crypto.subtle.exportKey("raw", vk.publicKey));
const vJwk = await crypto.subtle.exportKey("jwk", vk.privateKey);
const keys = {
  publicKey: b64urlEncode(vPub),
  privateKey: vJwk.d!,
  subject: "https://example.workers.dev",
};
const endpoint = "https://fcm.googleapis.com/fcm/send/abc123";
const authz = await vapidAuthorization(endpoint, keys);
const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(authz);
checks.push(["authorization format", !!m, authz.slice(0, 40)]);
if (m) {
  const claims = JSON.parse(dec.decode(b64urlDecode(m[2])));
  checks.push([
    "aud = push service origin",
    claims.aud === "https://fcm.googleapis.com",
    claims.aud,
  ]);
  checks.push([
    "exp ≤ 24h ahead",
    claims.exp - Date.now() / 1000 <= 24 * 3600 && claims.exp > Date.now() / 1000,
    claims.exp,
  ]);
  checks.push(["k = our public key", m[4] === keys.publicKey, null]);
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    vk.publicKey,
    b64urlDecode(m[3]),
    enc.encode(`${m[1]}.${m[2]}`),
  );
  checks.push(["signature verifies with our public key", ok, null]);
}

// ---- 3. allowed push services only
checks.push(["google ok", isAllowedEndpoint("https://fcm.googleapis.com/fcm/send/x"), null]);
checks.push(["apple ok", isAllowedEndpoint("https://web.push.apple.com/abc"), null]);
checks.push([
  "windows ok",
  isAllowedEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x"),
  null,
]);
checks.push(["random site refused", !isAllowedEndpoint("https://evil.example.com/push"), null]);
checks.push([
  "look-alike refused",
  !isAllowedEndpoint("https://fcm.googleapis.com.evil.com/x"),
  null,
]);
checks.push(["http refused", !isAllowedEndpoint("http://fcm.googleapis.com/x"), null]);
checks.push([
  "safeEqual",
  safeEqual("abc", "abc") && !safeEqual("abc", "abd") && !safeEqual("abc", "abcd"),
  null,
]);

// ---- 4. /push/dispatch
const req = (secret: string | null, payload: unknown) =>
  new Request("https://app.example.workers.dev/push/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret ? { "x-push-secret": secret } : {}) },
    body: JSON.stringify(payload),
  });
checks.push(["route: POST /push/dispatch", isPushDispatchRequest(req("x", {})), null]);
checks.push([
  "route: GET is not",
  !isPushDispatchRequest(new Request("https://a/push/dispatch")),
  null,
]);

delete process.env.PUSH_SECRET;
let r = await handlePushDispatch(req("s3cret", { subs: [], title: "x" }));
checks.push(["not configured → 503", r.status === 503, r.status]);

process.env.PUSH_SECRET = "s3cret-long-value";
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;
process.env.VITE_SUPABASE_URL = "https://db.example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY = "sb_publishable_test"; // حسبة: اسم المفتاح العام عندنا

r = await handlePushDispatch(req("wrong", { subs: [], title: "x" }));
checks.push(["wrong secret → 401", r.status === 401, r.status]);
r = await handlePushDispatch(req(null, { subs: [], title: "x" }));
checks.push(["no secret → 401", r.status === 401, r.status]);

const calls: { url: string; init: any }[] = [];
const fakeFetch = (async (url: any, init: any) => {
  calls.push({ url: String(url), init });
  const u = String(url);
  if (u.includes("/gone")) return new Response("", { status: 410 });
  if (u.includes("/rpc/push_forget")) return new Response("null", { status: 200 });
  return new Response("", { status: 201 });
}) as typeof fetch;

const good = { endpoint: "https://fcm.googleapis.com/fcm/send/live", ...sub };
const goneSub = { endpoint: "https://fcm.googleapis.com/fcm/send/gone", ...sub };
const evil = { endpoint: "https://evil.example.com/x", ...sub };
r = await handlePushDispatch(
  req("s3cret-long-value", {
    subs: [good, goneSub, evil],
    title: "طلب جديد",
    body: "طاولة 3",
    url: "https://evil.com",
    tag: "order:1",
  }),
  { fetchImpl: fakeFetch },
);
const out = await r.json();
checks.push(["dispatch → 200", r.status === 200, r.status]);
checks.push(["1 sent, 2 gone (410 + not a push service)", out.sent === 1 && out.gone === 2, out]);
checks.push([
  "evil endpoint never called",
  !calls.some((c) => c.url.includes("evil.example.com")),
  null,
]);
const pushCall = calls.find((c) => c.url.endsWith("/live"));
checks.push([
  "push sent encrypted",
  pushCall?.init.headers["Content-Encoding"] === "aes128gcm",
  null,
]);
checks.push(["urgency high", pushCall?.init.headers.Urgency === "high", null]);
const delivered = JSON.parse(await phoneDecrypt(pushCall!.init.body));
checks.push(["phone reads title", delivered.title === "طلب جديد", delivered.title]);
checks.push(["outside link replaced by /", delivered.url === "/", delivered.url]);
const forget = calls.find((c) => c.url.endsWith("/rpc/push_forget"));
const forgetBody = forget ? JSON.parse(forget.init.body) : null;
checks.push([
  "DB asked to forget the gone phones",
  forgetBody?._endpoints?.length === 2,
  forgetBody?._endpoints,
]);
checks.push([
  "forget call uses the public key only",
  forget?.init.headers.apikey === "sb_publishable_test",
  null,
]);

r = await handlePushDispatch(req("s3cret-long-value", { subs: [good], title: "" }), {
  fetchImpl: fakeFetch,
});
checks.push(["no title → 400", r.status === 400, r.status]);
r = await handlePushDispatch(
  req("s3cret-long-value", { subs: [good], title: "x", url: "/kitchen?order=5" }),
  { fetchImpl: fakeFetch },
);
const last = calls.filter((c) => c.url.endsWith("/live")).at(-1)!;
checks.push([
  "inside link kept",
  JSON.parse(await phoneDecrypt(last.init.body)).url === "/kitchen?order=5",
  null,
]);

let failed = 0;
for (const [name, ok, got] of checks) {
  if (!ok) failed++;
  console.log(ok ? "PASS" : "FAIL", name, ok ? "" : JSON.stringify(got));
}
console.log(failed ? `${failed} FAILED` : `all ${checks.length} passed`);
process.exit(failed ? 1 : 0);
