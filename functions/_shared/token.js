// Minimal signed-token helper (HMAC-SHA256) used to prove a student
// completed email OTP verification, without needing a database.
// Token shape: base64url(JSON payload) + "." + base64url(HMAC signature)

function b64urlEncode(bytes) {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecodeToBytes(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signToken(payload, secret) {
  const key = await getKey(secret);
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(new TextEncoder().encode(payloadStr));
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  const sigB64 = b64urlEncode(new Uint8Array(sig));
  return payloadB64 + "." + sigB64;
}

// Returns the decoded payload object if the token is validly signed and
// not expired (payload.exp is a unix-ms timestamp), otherwise null.
export async function verifyToken(token, secret) {
  if (!token || typeof token !== "string" || token.indexOf(".") === -1) return null;
  const [payloadB64, sigB64] = token.split(".");
  try {
    const key = await getKey(secret);
    const sigBytes = b64urlDecodeToBytes(sigB64);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecodeToBytes(payloadB64)));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}
