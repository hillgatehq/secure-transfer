import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  exportPrivateKey,
  exportPublicKey,
  fingerprint,
  generateKeyPair,
  importPrivateKey,
  importPublicKey,
  modulusBits,
  open,
  parseEnvelope,
  publicKeyFromPrivate,
  safeFilename,
  seal,
  TransferError,
} from "./crypto.ts";

const utf8 = new TextEncoder();
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

// 2048 keeps the suite fast; the size is a parameter, not a behaviour.
const pair = await generateKeyPair(2048);
const publicPem = await exportPublicKey(pair.publicKey);
const privatePem = await exportPrivateKey(pair.privateKey);

Deno.test("PEM round-trips through export and import", async () => {
  assert(publicPem.startsWith("-----BEGIN PUBLIC KEY-----\n"));
  assert(publicPem.trimEnd().endsWith("-----END PUBLIC KEY-----"));
  assert(privatePem.startsWith("-----BEGIN PRIVATE KEY-----\n"));
  assertEquals(
    await fingerprint(await importPublicKey(publicPem)),
    await fingerprint(pair.publicKey),
  );
  assertEquals(await modulusBits(await importPublicKey(publicPem)), 2048);
});

Deno.test("a sealed payload opens back to the same bytes", async () => {
  const envelope = await seal(utf8.encode("correct horse battery staple"), publicPem, "note.txt");
  const opened = await open(envelope, pair.privateKey);
  assertEquals(text(opened.bytes), "correct horse battery staple");
  assertEquals(opened.filename, "note.txt");
});

Deno.test("binary and unicode payloads survive intact", async () => {
  // Larger than one getRandomValues quota and than the base64 chunk size.
  const bytes = new Uint8Array(200_000);
  for (let i = 0; i < bytes.length; i += 32_768) {
    crypto.getRandomValues(bytes.subarray(i, Math.min(i + 32_768, bytes.length)));
  }
  const opened = await open(await seal(bytes, publicPem, "blob.bin"), pair.privateKey);
  assertEquals(opened.bytes, bytes);

  const emoji = "\u{1F510} clef \u{1D11E} éèê";
  const back = await open(await seal(utf8.encode(emoji), publicPem, "u.txt"), pair.privateKey);
  assertEquals(text(back.bytes), emoji);
});

Deno.test("an empty payload is still a valid envelope", async () => {
  const opened = await open(await seal(new Uint8Array(0), publicPem, "e.txt"), pair.privateKey);
  assertEquals(opened.bytes.length, 0);
});

Deno.test("every envelope uses a fresh content key and IV", async () => {
  const a = await seal(utf8.encode("same"), publicPem, "f.txt");
  const b = await seal(utf8.encode("same"), publicPem, "f.txt");
  assert(a.iv !== b.iv, "IV must not repeat");
  assert(a.encryptedSymmetricKey !== b.encryptedSymmetricKey, "content key must not repeat");
  assert(a.encryptedPayload !== b.encryptedPayload, "ciphertext must not repeat");
});

Deno.test("a private key alone is enough to decrypt", async () => {
  const envelope = await seal(utf8.encode("from a saved key"), publicPem, "s.txt");
  const imported = await importPrivateKey(privatePem);
  assertEquals(text((await open(envelope, imported)).bytes), "from a saved key");
  assertEquals(await fingerprint(await publicKeyFromPrivate(imported)), envelope.recipient);
});

Deno.test("the wrong private key is rejected", async () => {
  const other = await generateKeyPair(2048);
  const envelope = await seal(utf8.encode("not for you"), publicPem, "x.txt");
  await assertRejects(
    () => open(envelope, other.privateKey),
    TransferError,
    "sealed for a different key",
  );
});

Deno.test("tampering with bound metadata breaks decryption", async () => {
  const base = await seal(utf8.encode("invoice: 100"), publicPem, "invoice.txt");

  await assertRejects(
    () => open({ ...base, filename: "invoice-EDITED.txt" }, pair.privateKey),
    TransferError,
    "integrity check",
  );
  await assertRejects(
    () => open({ ...base, createdAt: "2001-01-01T00:00:00.000Z" }, pair.privateKey),
    TransferError,
    "integrity check",
  );
});

Deno.test("tampering with the ciphertext breaks decryption", async () => {
  const base = await seal(utf8.encode("invoice: 100"), publicPem, "invoice.txt");
  const bytes = Uint8Array.from(atob(base.encryptedPayload), (c) => c.charCodeAt(0));
  bytes[0] = (bytes[0] ?? 0) ^ 0x01;
  const flipped = btoa(String.fromCharCode(...bytes));
  await assertRejects(
    () => open({ ...base, encryptedPayload: flipped }, pair.privateKey),
    TransferError,
    "integrity check",
  );
});

Deno.test("envelope parsing rejects malformed and downgraded input", () => {
  assertThrows(() => parseEnvelope("not json"), TransferError, "not valid JSON");
  assertThrows(() => parseEnvelope("[1,2]"), TransferError, "must be a JSON object");
  assertThrows(
    () =>
      parseEnvelope(
        JSON.stringify({
          type: "secure-transfer/v1",
          v: 1,
          kem: "RSA-OAEP-256",
          dem: "AES-128-CBC",
        }),
      ),
    TransferError,
    "only understands",
  );
  assertThrows(
    () =>
      parseEnvelope(
        JSON.stringify({
          type: "secure-transfer/v1",
          v: 1,
          kem: "RSA-OAEP-256",
          dem: "AES-256-GCM",
        }),
      ),
    TransferError,
    'missing the "recipient" field',
  );
});

Deno.test("a real envelope parses to an identical object", async () => {
  const envelope = await seal(utf8.encode("hello"), publicPem, "h.txt");
  assertEquals(parseEnvelope(JSON.stringify(envelope, null, 2)), envelope);
});

Deno.test("pasting a private key where a public key belongs is caught", async () => {
  await assertRejects(() => importPublicKey(privatePem), TransferError, "That is a private key");
});

Deno.test("PKCS#1 keys get a conversion hint", async () => {
  const pkcs1 = "-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----";
  await assertRejects(() => importPrivateKey(pkcs1), TransferError, "PKCS#8");
});

Deno.test("junk in a key field is reported, not thrown raw", async () => {
  await assertRejects(
    () => importPublicKey("hello"),
    TransferError,
    "does not look like a PEM key",
  );
  await assertRejects(
    () => importPublicKey("-----BEGIN PUBLIC KEY-----\n$$$$\n-----END PUBLIC KEY-----"),
    TransferError,
  );
});

Deno.test("filenames cannot escape the downloads folder", () => {
  assertEquals(safeFilename("../../etc/passwd"), "_.._etc_passwd");
  assertEquals(safeFilename("a/b\\c:d*e?.txt"), "a_b_c_d_e_.txt");
  assertEquals(safeFilename("   "), "payload.txt");
  assertEquals(safeFilename(""), "payload.txt");
  assertEquals(safeFilename("x".repeat(500)).length, 120);
});
