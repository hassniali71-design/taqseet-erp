/**
 * إرسال إشعار للتليفون (Web Push) من السيرفر — من غير أي مكتبة برة، بـ WebCrypto بس
 * (شغال على Cloudflare Workers وعلى bun للتجربة). نفس الملف في دكانة وسفرة.
 *
 * المعايير:
 *  - RFC 8291: تشفير الرسالة (aes128gcm) بمفاتيح التليفون (p256dh + auth)، فمحدش في النص يقراها.
 *  - RFC 8292: VAPID — توقيع بمفتاحنا السري عشان جوجل/أبل يعرفوا الرسالة جاية مننا.
 *
 * المفاتيح: VAPID_PUBLIC_KEY (65 بايت، base64url) وVAPID_PRIVATE_KEY (32 بايت d، base64url)
 * أسرار على الـ Worker. المفتاح العام بس هو اللي بيروح للتليفون.
 */

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };
export type VapidKeys = { publicKey: string; privateKey: string; subject: string };
export type PushResult = { endpoint: string; status: number; ok: boolean; gone: boolean };

const enc = new TextEncoder();

/** WebCrypto/fetch want an ArrayBuffer-backed view (newer TypeScript is strict about it) */
const bs = (u: Uint8Array): Uint8Array<ArrayBuffer> => u as Uint8Array<ArrayBuffer>;

export function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    bs(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, bs(data)));
}

/** HKDF (extract + expand لطول ≤ 32) */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  len: number,
): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, len);
}

/** خدمات الإشعارات المعروفة بس (جوجل، أبل، موزيلا، مايكروسوفت) — عشان السيرفر مايبعتش لأي عنوان */
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  ".push.apple.com",
  "updates.push.services.mozilla.com",
  ".notify.windows.com",
];

export function isAllowedEndpoint(endpoint: string): boolean {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  return PUSH_HOSTS.some((p) => (p.startsWith(".") ? h.endsWith(p) : h === p));
}

/** التوقيع (JWT ES256) اللي بيثبت إن الإشعار جاي مننا */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  now = Date.now(),
): Promise<string> {
  const pub = b64urlDecode(keys.publicKey);
  if (pub.length !== 65 || pub[0] !== 4)
    throw new Error("VAPID public key must be 65 bytes (uncompressed P-256)");
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: keys.privateKey,
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
    ext: true,
  };
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + 12 * 3600,
        sub: keys.subject,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned)),
  );
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${keys.publicKey}`;
}

/** تشفير الرسالة لتليفون واحد (RFC 8291، aes128gcm، رسالة واحدة) */
export async function encryptPayload(
  payload: Uint8Array,
  sub: Pick<PushSubscriptionKeys, "p256dh" | "auth">,
  opts: { salt?: Uint8Array; serverKeys?: CryptoKeyPair } = {},
): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(sub.p256dh);
  const authSecret = b64urlDecode(sub.auth);
  if (uaPublic.length !== 65) throw new Error("bad p256dh");
  if (authSecret.length < 16) throw new Error("bad auth");

  const server =
    opts.serverKeys ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", server.publicKey));
  const uaKey = await crypto.subtle.importKey(
    "raw",
    bs(uaPublic),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaKey } as EcdhKeyDeriveParams,
      server.privateKey,
      256,
    ),
  );

  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const plain = concat(payload, new Uint8Array([2])); // 2 = آخر (وأول) جزء
  const aesKey = await crypto.subtle.importKey("raw", bs(cek), "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(nonce) }, aesKey, bs(plain)),
  );

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** ابعت إشعار لتليفون واحد. gone=true يعني التليفون ده اتشال (البرنامج اتمسح أو الإذن اتقفل): امسحه. */
export async function sendPush(
  sub: PushSubscriptionKeys,
  message: unknown,
  keys: VapidKeys,
  opts: {
    ttl?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
    fetchImpl?: typeof fetch;
  } = {},
): Promise<PushResult> {
  if (!isAllowedEndpoint(sub.endpoint))
    return { endpoint: sub.endpoint, status: 0, ok: false, gone: true };
  const body = await encryptPayload(enc.encode(JSON.stringify(message)), sub);
  const res = await (opts.fetchImpl ?? fetch)(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, keys),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(opts.ttl ?? 6 * 3600),
      Urgency: opts.urgency ?? "high",
    },
    body: bs(body),
  });
  return {
    endpoint: sub.endpoint,
    status: res.status,
    ok: res.ok,
    gone: res.status === 404 || res.status === 410,
  };
}
