# Secure transfer

A static page for handing a secret to someone over a channel you do not trust.
The recipient makes an RSA key pair and passes out the public half; the sender
seals a payload to it; only the private half, which never leaves the recipient's
browser, can open the result.

No server, no accounts, no storage, no third-party scripts. Everything happens in
the tab.

**[hillgatehq.github.io/secure-transfer](https://hillgatehq.github.io/secure-transfer/)**

## How it works

RSA-OAEP (SHA-256) wraps a single-use AES-256-GCM content key, which encrypts the
payload. The envelope's metadata is bound into the GCM tag, so the filename and
algorithm fields cannot be edited without decryption failing.

Read [SECURITY.md](SECURITY.md) before relying on it. The short version: verify
the public key's fingerprint out of band, and use a fresh key pair per transfer.
Decryption proves the contents were not altered — it does not prove who sent
them.

## Receiving

1. Generate a key pair.
2. Send the sender `public-key.pem`. Read the fingerprint aloud over a channel
   you both already trust so they can check it.
3. Keep `private-key.pem`. It never goes anywhere.
4. Paste the envelope they send back.
5. Decrypt, then copy or save the result.

## Sending

1. Write the payload.
2. Paste the recipient's public key. Check the fingerprint against what they read
   out to you.
3. Name the file.
4. Encrypt, then send back `encrypted-payload.json`.

## Keys from elsewhere

Any PKCS#8 / SPKI RSA key pair works, so you can bring your own:

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out private-key.pem
openssl pkey -in private-key.pem -pubout -out public-key.pem
```

The fingerprint shown in the interface is a plain SHA-256 over the DER-encoded
public key, so it can be verified independently:

```sh
openssl pkey -pubin -in public-key.pem -outform DER | openssl dgst -sha256
```

PKCS#1 keys (`-----BEGIN RSA PRIVATE KEY-----`) are not supported; convert them
with `openssl pkey` first.

## Development

Requires [Deno](https://deno.com) 2.x and nothing else — no `package.json`, no
`node_modules`.

```sh
deno task test     # crypto round trips, tampering, malformed input
deno task check    # typecheck
deno task build    # bundle to dist/
deno task serve    # serve dist/ locally
```

`deno bundle` compiles `src/main.tsx` and its dependencies, Preact included, into
a single `dist/app.js`. Tailwind compiles to a static `dist/styles.css` in the
same step.

Pushing to `main` builds and deploys via
[.github/workflows/deploy.yml](.github/workflows/deploy.yml). Pull requests run
the same checks without deploying. `dist/` is not committed; Pages serves the
uploaded artifact verbatim, so Jekyll never runs.

This needs Settings → Pages → Source set to **GitHub Actions**. The workflow
cannot set it: creating a Pages site needs repository admin, while the workflow
token's `pages: write` only covers deploying to a site that already exists.

## Layout

```
src/crypto.ts    all cryptography, PEM handling, envelope format
src/ui.tsx       shared components
src/receive.tsx  the receiving flow
src/send.tsx     the sending flow
src/app.tsx      shell, routing, the diagram
public/          index.html, stylesheet entry, icon
```
