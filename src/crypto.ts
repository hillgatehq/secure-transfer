/**
 * Hybrid public-key encryption on top of WebCrypto.
 *
 * RSA-OAEP (SHA-256) wraps a single-use AES-256-GCM content key; the content
 * key encrypts the payload. RSA alone cannot carry more than a few hundred
 * bytes, so every practical public-key scheme is a construction like this one.
 *
 * All envelope metadata is bound into the GCM tag as additional authenticated
 * data, so the filename, the algorithm names and the recipient fingerprint
 * cannot be altered without the recipient's decryption failing.
 */

export const ENVELOPE_TYPE = "secure-transfer/v1";
export const ENVELOPE_VERSION = 1;
export const KEM = "RSA-OAEP-256";
export const DEM = "AES-256-GCM";

const OAEP_HASH = "SHA-256";
const AES_KEY_BITS = 256;
const GCM_IV_BYTES = 12; // 96 bits: the size AES-GCM is specified and analysed for
const GCM_TAG_BITS = 128;
const PUBLIC_EXPONENT = new Uint8Array([0x01, 0x00, 0x01]); // 65537

export const MODULUS_SIZES = [2048, 3072, 4096] as const;
export type ModulusSize = (typeof MODULUS_SIZES)[number];

/** An error whose message is safe and useful to show to a person. */
export class TransferError extends Error {
  override readonly name = "TransferError";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export interface Envelope {
  type: typeof ENVELOPE_TYPE;
  v: typeof ENVELOPE_VERSION;
  kem: typeof KEM;
  dem: typeof DEM;
  /** SHA-256 of the recipient's SubjectPublicKeyInfo, lowercase hex. */
  recipient: string;
  filename: string;
  createdAt: string;
  encryptedSymmetricKey: string;
  iv: string;
  encryptedPayload: string;
}

/* ------------------------------------------------------------------ bytes */

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string, field: string): Uint8Array {
  const compact = base64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new TransferError(`The "${field}" field is not valid base64.`);
  }
  try {
    const binary = atob(compact);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch (cause) {
    throw new TransferError(`The "${field}" field is not valid base64.`, { cause });
  }
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* -------------------------------------------------------------------- PEM */

const PUBLIC_LABEL = "PUBLIC KEY";
const PRIVATE_LABEL = "PRIVATE KEY";

function pemEncode(label: string, der: ArrayBuffer): string {
  const body = bytesToBase64(new Uint8Array(der)).match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${body.join("\n")}\n-----END ${label}-----\n`;
}

function pemDecode(text: string, expected: string): Uint8Array {
  const match = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(text.trim());
  if (!match) {
    throw new TransferError(
      "That does not look like a PEM key. It should start with -----BEGIN " +
        `${expected}----- and end with -----END ${expected}-----.`,
    );
  }
  const [, label = "", body = ""] = match;
  if (label !== expected) {
    if (label === PRIVATE_LABEL && expected === PUBLIC_LABEL) {
      throw new TransferError(
        "That is a private key. Never share or paste a private key here — ask the " +
          "recipient for their public key instead.",
      );
    }
    if (label === "RSA PRIVATE KEY" || label === "RSA PUBLIC KEY") {
      throw new TransferError(
        `This is a PKCS#1 key ("${label}"). Convert it to PKCS#8/SPKI first, for example ` +
          "with: openssl pkey -in key.pem -pubout.",
      );
    }
    throw new TransferError(`Expected a "${expected}" block but found "${label}".`);
  }
  return base64ToBytes(body, expected);
}

/* ------------------------------------------------------------------- keys */

export async function generateKeyPair(modulusLength: ModulusSize): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength,
      publicExponent: PUBLIC_EXPONENT,
      hash: OAEP_HASH,
    },
    true,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
  ) as CryptoKeyPair;
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  return pemEncode(PUBLIC_LABEL, await crypto.subtle.exportKey("spki", key));
}

export async function exportPrivateKey(key: CryptoKey): Promise<string> {
  return pemEncode(PRIVATE_LABEL, await crypto.subtle.exportKey("pkcs8", key));
}

export async function importPublicKey(pem: string): Promise<CryptoKey> {
  const der = pemDecode(pem, PUBLIC_LABEL);
  try {
    return await crypto.subtle.importKey(
      "spki",
      der as BufferSource,
      { name: "RSA-OAEP", hash: OAEP_HASH },
      true,
      ["encrypt", "wrapKey"],
    );
  } catch (cause) {
    throw new TransferError("That public key could not be read as an RSA key.", { cause });
  }
}

export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const der = pemDecode(pem, PRIVATE_LABEL);
  try {
    return await crypto.subtle.importKey(
      "pkcs8",
      der as BufferSource,
      { name: "RSA-OAEP", hash: OAEP_HASH },
      true,
      ["decrypt", "unwrapKey"],
    );
  } catch (cause) {
    throw new TransferError(
      "That private key could not be read. It must be an unencrypted PKCS#8 RSA key.",
      { cause },
    );
  }
}

/** Derive the public key of an RSA private key, so a saved key alone is enough to decrypt. */
export async function publicKeyFromPrivate(privateKey: CryptoKey): Promise<CryptoKey> {
  const { n, e } = await crypto.subtle.exportKey("jwk", privateKey);
  if (!n || !e) {
    throw new TransferError("That private key does not carry an RSA modulus and exponent.");
  }
  return await crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n, e, alg: "RSA-OAEP-256", ext: true, key_ops: ["encrypt", "wrapKey"] },
    { name: "RSA-OAEP", hash: OAEP_HASH },
    true,
    ["encrypt", "wrapKey"],
  );
}

/** SHA-256 over the SubjectPublicKeyInfo. Compare this out of band to defeat key swapping. */
export async function fingerprint(publicKey: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey("spki", publicKey);
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", spki)));
}

export function formatFingerprint(hex: string): string {
  return (hex.match(/.{1,4}/g) ?? []).join(" ").toUpperCase();
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  return base64ToBytes(padded + "=".repeat((4 - (padded.length % 4)) % 4), "modulus");
}

export async function modulusBits(publicKey: CryptoKey): Promise<number> {
  const { n } = await crypto.subtle.exportKey("jwk", publicKey);
  if (!n) return 0;
  return base64UrlToBytes(n).length * 8;
}

/* --------------------------------------------------------------- envelope */

type EnvelopeHeader = Omit<Envelope, "encryptedSymmetricKey" | "iv" | "encryptedPayload">;

/**
 * Metadata bound into the AES-GCM tag. Serialised as a positional array so the
 * bytes never depend on JSON key ordering.
 */
function additionalData(header: EnvelopeHeader): Uint8Array {
  return new TextEncoder().encode(JSON.stringify([
    header.type,
    header.v,
    header.kem,
    header.dem,
    header.recipient,
    header.filename,
    header.createdAt,
  ]));
}

export async function seal(
  plaintext: Uint8Array,
  recipientPublicKeyPem: string,
  filename: string,
): Promise<Envelope> {
  const publicKey = await importPublicKey(recipientPublicKeyPem);
  const bits = await modulusBits(publicKey);
  if (bits < 2048) {
    throw new TransferError(
      `That key is only ${bits} bits. Ask for a key of at least 2048 bits — anything ` +
        "smaller is not considered secure.",
    );
  }

  const contentKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: AES_KEY_BITS },
    true, // must be extractable to be wrapped; the raw bytes never enter JavaScript
    ["encrypt"],
  );

  const header: EnvelopeHeader = {
    type: ENVELOPE_TYPE,
    v: ENVELOPE_VERSION,
    kem: KEM,
    dem: DEM,
    recipient: await fingerprint(publicKey),
    filename,
    createdAt: new Date().toISOString(),
  };

  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
      additionalData: additionalData(header) as BufferSource,
      tagLength: GCM_TAG_BITS,
    },
    contentKey,
    plaintext as BufferSource,
  );
  const wrapped = await crypto.subtle.wrapKey("raw", contentKey, publicKey, { name: "RSA-OAEP" });

  return {
    ...header,
    encryptedSymmetricKey: bytesToBase64(new Uint8Array(wrapped)),
    iv: bytesToBase64(iv),
    encryptedPayload: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

function expect(value: unknown, wanted: string | number, field: string): void {
  if (value !== wanted) {
    throw new TransferError(
      `This envelope has "${field}": ${JSON.stringify(value)}, but this page only understands ` +
        `${JSON.stringify(wanted)}.`,
    );
  }
}

const STRING_FIELDS = [
  "recipient",
  "filename",
  "createdAt",
  "encryptedSymmetricKey",
  "iv",
  "encryptedPayload",
] as const;

export function parseEnvelope(text: string): Envelope {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new TransferError("That is not valid JSON. Paste the whole envelope, braces included.", {
      cause,
    });
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TransferError("An envelope must be a JSON object.");
  }
  const e = value as Record<string, unknown>;
  expect(e["type"], ENVELOPE_TYPE, "type");
  expect(e["v"], ENVELOPE_VERSION, "v");
  expect(e["kem"], KEM, "kem");
  expect(e["dem"], DEM, "dem");
  for (const field of STRING_FIELDS) {
    if (typeof e[field] !== "string") {
      throw new TransferError(`This envelope is missing the "${field}" field.`);
    }
  }
  return e as unknown as Envelope;
}

export interface Opened {
  bytes: Uint8Array;
  filename: string;
  envelope: Envelope;
}

export async function open(envelope: Envelope, privateKey: CryptoKey): Promise<Opened> {
  const ours = await fingerprint(await publicKeyFromPrivate(privateKey));
  if (ours !== envelope.recipient) {
    throw new TransferError(
      "This envelope was sealed for a different key. Its recipient fingerprint is " +
        `${formatFingerprint(envelope.recipient)}, and yours is ${formatFingerprint(ours)}.`,
    );
  }

  const wrapped = base64ToBytes(envelope.encryptedSymmetricKey, "encryptedSymmetricKey");
  const iv = base64ToBytes(envelope.iv, "iv");
  if (iv.length !== GCM_IV_BYTES) {
    throw new TransferError(`The "iv" field must be ${GCM_IV_BYTES} bytes.`);
  }
  const ciphertext = base64ToBytes(envelope.encryptedPayload, "encryptedPayload");

  let contentKey: CryptoKey;
  try {
    contentKey = await crypto.subtle.unwrapKey(
      "raw",
      wrapped as BufferSource,
      privateKey,
      { name: "RSA-OAEP" },
      { name: "AES-GCM", length: AES_KEY_BITS },
      false,
      ["decrypt"],
    );
  } catch (cause) {
    throw new TransferError(
      "The content key could not be unwrapped. The envelope does not match this private key.",
      { cause },
    );
  }

  const { encryptedSymmetricKey: _k, iv: _i, encryptedPayload: _p, ...header } = envelope;
  let bytes: Uint8Array;
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv as BufferSource,
        additionalData: additionalData(header) as BufferSource,
        tagLength: GCM_TAG_BITS,
      },
      contentKey,
      ciphertext as BufferSource,
    );
    bytes = new Uint8Array(plaintext);
  } catch (cause) {
    throw new TransferError(
      "This envelope failed its integrity check. It was altered in transit, or a field such " +
        "as the filename was edited after sealing.",
      { cause },
    );
  }

  return { bytes, filename: safeFilename(envelope.filename), envelope };
}

/** Strip anything that could escape the downloads folder or confuse a shell. */
export function safeFilename(name: string): string {
  const cleaned = name
    .replace(/[ -<>:"/\\|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return cleaned.slice(0, 120) || "payload.txt";
}
