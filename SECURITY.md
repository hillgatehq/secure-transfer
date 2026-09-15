# Cryptographic design and threat model

This page exists to move a secret between two people who have no shared secret
yet and no channel they both trust. Everything below is the reasoning behind the
choices, and — more importantly — the limits of what they buy you.

## The construction

RSA cannot encrypt a payload. A 4096-bit RSA-OAEP key can carry at most
`4096/8 − 2 × 32 − 2 = 446` bytes, and RSA is orders of magnitude slower than a
block cipher. So, like every practical public-key scheme, this is a hybrid:

1. Generate a fresh AES-256 key for this one message (the *content key*).
2. Encrypt the payload with AES-256-GCM under that content key.
3. Encrypt the content key with the recipient's RSA-OAEP public key.
4. Ship all three parts as one JSON envelope.

| Choice | Value | Why |
| --- | --- | --- |
| Key encapsulation | RSA-OAEP, SHA-256 | OAEP has a security proof. PKCS#1 v1.5 encryption does not, and is the source of the Bleichenbacher padding-oracle family. WebCrypto only offers OAEP, which is the right default anyway. |
| RSA modulus | 4096 bits (2048 minimum) | 3072 is the NIST floor for 128-bit-equivalent security past 2030. Key generation is a one-off cost here, so 4096 is nearly free. 2048 is offered but flagged in the interface. |
| Public exponent | 65537 | Standard. Small exponents like 3 are fragile in related settings and buy nothing. |
| Content encryption | AES-256-GCM | Authenticated. Tampering is detected instead of silently decrypting to garbage. |
| IV | 96 bits, from `crypto.getRandomValues`, fresh per message | 96 bits is the size GCM is specified and analysed for. Reusing an IV under one key is catastrophic for GCM — it leaks the authentication subkey. Here the content key is single-use, so reuse cannot happen even in principle. |
| Auth tag | 128 bits | The full tag. Truncation weakens forgery resistance for no real saving. |
| Randomness | `crypto.getRandomValues` only | `Math.random()` is not a CSPRNG and must never appear anywhere near this. |

The content key is moved with `wrapKey`/`unwrapKey` rather than
`exportKey` + `encrypt`, so the raw AES key bytes never exist as a JavaScript
value.

## The envelope

```json
{
  "type": "secure-transfer/v1",
  "v": 1,
  "kem": "RSA-OAEP-256",
  "dem": "AES-256-GCM",
  "recipient": "<sha-256 of the recipient SPKI, hex>",
  "filename": "deploy-token.txt",
  "createdAt": "2026-09-15T10:44:00.000Z",
  "encryptedSymmetricKey": "<base64: content key under RSA-OAEP>",
  "iv": "<base64: 12 bytes>",
  "encryptedPayload": "<base64: ciphertext || 16-byte GCM tag>"
}
```

Three practices are worth calling out, because they are the ones most often
skipped:

**Bind the metadata.** Everything above the ciphertext — version, both algorithm
names, the recipient fingerprint, the filename, the timestamp — is passed to
AES-GCM as *additional authenticated data*. It is not encrypted, but it cannot be
changed: edit the filename in the JSON and decryption fails. Without this, an
attacker can rewrite any plaintext field, and `filename` in particular is a field
the recipient will act on. The AAD is serialised as a positional JSON array, so
the bytes never depend on object key ordering.

**State the algorithms, then refuse anything else.** The `kem` and `dem` fields
make the envelope self-describing for future changes, and the parser rejects any
value it does not implement. An algorithm field that is *read* rather than
*checked* is a downgrade attack waiting to happen.

**Name the recipient key.** The `recipient` fingerprint means the receiver gets
"this was sealed for a different key, here are both fingerprints" instead of an
opaque decryption failure.

## What this protects against

Someone who reads the envelope in transit — on the wire, in a mailbox, in a chat
log, in a backup — learns nothing about the payload beyond its approximate size.
Someone who *modifies* it in transit cannot make it decrypt to anything at all.
You can therefore send the envelope over any channel you like.

## What it does not protect against

**It does not tell you who sent it.** This is the most misunderstood property of
public-key encryption. Your public key is public; anyone holding it can seal a
perfectly valid envelope. Decryption proves the contents were not altered *after
sealing* — it says nothing about who did the sealing. If you need that, the
sender needs their own signing key and you need their verified public key, which
is a larger problem than this page solves.

**It does not protect a public key that was swapped in transit.** If an attacker
can modify the channel you used to send your public key, they substitute their
own, the sender seals to it, the attacker decrypts, reseals to your real key and
forwards. Nothing in the envelope reveals this. The entire security of the
scheme rests on the sender getting *your* key.

This is why both flows display a SHA-256 fingerprint of the public key, and why
it is worth the thirty seconds: **read the fingerprint aloud over a channel the
other party already trusts**, and have them compare it to what their screen
shows. A phone call where you recognise the voice, or a message on an app you
already use, is enough. Skipping this reduces the scheme to "encrypted against
passive eavesdroppers only".

The fingerprint is a plain SHA-256 over the SubjectPublicKeyInfo, so it can be
checked independently:

```sh
openssl pkey -pubin -in public-key.pem -outform DER | openssl dgst -sha256
```

**It has no forward secrecy.** The content key is protected only by the RSA
private key. Anyone who obtains that private key later can decrypt every envelope
ever sealed to it, including ones they recorded months earlier. The mitigation is
operational, and the interface is built around it: generate a key pair per
transfer, and destroy it when you are done. Do not keep a long-lived key here.

**Metadata is not hidden.** `filename`, `createdAt` and the approximate payload
size are visible to anyone holding the envelope. They are authenticated, not
encrypted. Name the file something dull.

**The page is the trusted computing base.** The JavaScript doing the encrypting
is delivered over the network, so whoever controls the hosting controls the
cryptography. This is inherent to all browser-delivered crypto and is the honest
argument against this whole category of tool. What is done about it here:

- No third-party scripts at all. Preact is bundled into `app.js` at build time
  and pinned; Tailwind is compiled to a static stylesheet at build time. The only
  remote requests are the web fonts, which the page degrades gracefully without.
- A Content Security Policy with `default-src 'none'`, `script-src 'self'` and,
  most importantly, **`connect-src 'none'`** — once loaded, the page cannot open
  a network connection of any kind, so nothing typed into it can be sent
  anywhere. No inline scripts or styles, so no `'unsafe-inline'`.
- No storage. Nothing is written to `localStorage`, `sessionStorage`, cookies or
  IndexedDB. Closing the tab destroys the keys.
- No analytics, no error reporting, no service worker, no server.
- The build is reproducible from source in this repository, and the page runs
  offline — save it and open it from disk if you prefer to pin a version you have
  read.

**Your own machine is out of scope.** Malware, a hostile browser extension with
page access, a shoulder-surfer, or a clipboard manager that syncs to the cloud
all defeat this completely. The private key and the plaintext exist in the
browser's memory while you work.

## Handling the private key

Generated with `extractable: true`, because the interface has to show it to you.
The consequences are worth being explicit about:

- It only ever exists in that tab. It is never transmitted, and closing the tab
  destroys it.
- If you save `private-key.pem`, it is a plaintext secret on disk. Treat it like
  one, and delete it once the transfer is done.
- Passphrase-protecting it is deliberately not offered. Doing it properly means
  encrypted PKCS#8 with PBES2/scrypt, which WebCrypto does not implement, and a
  hand-rolled DER encoder handling private keys is exactly the kind of code that
  should not be written casually. Single-use keys are the better answer: generate,
  transfer, destroy.
- Never paste a private key into the sending side. The page detects a
  `PRIVATE KEY` PEM in the recipient-key field and refuses it with an explanation.

## Things deliberately not done

- RSA used to encrypt the payload directly — cannot work beyond a few hundred
  bytes, and is not what RSA is for.
- AES-CBC, or any unauthenticated mode — decrypts tampered data silently and
  invites padding oracles. Encrypt-then-MAC or an AEAD, always.
- PKCS#1 v1.5 encryption padding — see Bleichenbacher.
- A key derived from a shared password — a different scheme entirely, needing
  Argon2id or scrypt, and not what was asked for.
- Truncated fingerprints — the full 256 bits are displayed. A short fingerprint
  is a collision target.
- Rolling any primitive by hand. Every operation is WebCrypto.

## If you want something stronger

This is a small, auditable tool for occasional one-off handoffs. For anything
routine or high-value, use software that has been reviewed by cryptographers:
[age](https://age-encryption.org) for file encryption, or a maintained OpenPGP
implementation where you need the web-of-trust machinery and signing.

If this were rebuilt today without the RSA constraint, the modern choice would be
an ECDH KEM over X25519 with HKDF — 32-byte keys instead of 800-byte PEMs,
instant key generation, and a construction (HPKE, RFC 9180) that is standardised
end to end. RSA was specified here, and RSA-OAEP with the parameters above is a
sound choice; it is simply the heavier one.
