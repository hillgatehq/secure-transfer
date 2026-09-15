import { useState } from "preact/hooks";
import {
  exportPrivateKey,
  exportPublicKey,
  fingerprint,
  generateKeyPair,
  importPrivateKey,
  MODULUS_SIZES,
  type ModulusSize,
  open as openEnvelope,
  type Opened,
  parseEnvelope,
  publicKeyFromPrivate,
} from "./crypto.ts";
import {
  Action,
  Button,
  download,
  Field,
  Fingerprint,
  Ledger,
  Notice,
  Plate,
  Step,
  TextArea,
  useCopy,
  Verbatim,
} from "./ui.tsx";
import { asMessage, decodeText } from "./util.ts";

const ENVELOPE_HINT = '{\n  "type": "secure-transfer/v1",\n  ...\n}';

interface Held {
  privateKey: CryptoKey;
  publicPem: string;
  privatePem: string | null; // null when the key arrived by paste
  fingerprint: string;
}

export function ReceiveFlow() {
  const [size, setSize] = useState<ModulusSize>(4096);
  const [held, setHeld] = useState<Held | null>(null);
  const [making, setMaking] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const [pasted, setPasted] = useState("");
  const [envelopeText, setEnvelopeText] = useState("");
  const [opened, setOpened] = useState<Opened | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const [copiedPub, copyPub] = useCopy();
  const [copiedPriv, copyPriv] = useCopy();
  const [copiedOut, copyOut] = useCopy();

  async function makeKeys() {
    setMaking(true);
    setKeyError(null);
    setOpened(null);
    setOpenError(null);
    try {
      // Yield first so the button reaches its busy state before the main
      // thread blocks on key generation.
      await new Promise((r) => setTimeout(r, 30));
      const pair = await generateKeyPair(size);
      setHeld({
        privateKey: pair.privateKey,
        publicPem: await exportPublicKey(pair.publicKey),
        privatePem: await exportPrivateKey(pair.privateKey),
        fingerprint: await fingerprint(pair.publicKey),
      });
    } catch (error) {
      setKeyError(asMessage(error, "The key pair could not be generated."));
    } finally {
      setMaking(false);
    }
  }

  async function useExistingKey() {
    setKeyError(null);
    try {
      const privateKey = await importPrivateKey(pasted);
      const publicKey = await publicKeyFromPrivate(privateKey);
      setHeld({
        privateKey,
        publicPem: await exportPublicKey(publicKey),
        privatePem: null,
        fingerprint: await fingerprint(publicKey),
      });
      setPasted("");
    } catch (error) {
      setKeyError(asMessage(error, "That private key could not be read."));
    }
  }

  async function decrypt() {
    if (!held) return;
    setOpening(true);
    setOpenError(null);
    setOpened(null);
    try {
      setOpened(await openEnvelope(parseEnvelope(envelopeText), held.privateKey));
    } catch (error) {
      setOpenError(asMessage(error, "This envelope could not be opened."));
    } finally {
      setOpening(false);
    }
  }

  const text = opened ? decodeText(opened.bytes) : null;

  return (
    <Ledger>
      <Step n={1} title="Make a key pair" state={held ? "done" : "here"}>
        <p class="max-w-prose text-sm leading-relaxed text-muted">
          Both keys are made in this tab and stay here. The public key is the half you hand out; the
          private key is the only thing that can open what comes back.
        </p>
        <div class="flex flex-wrap items-center gap-3">
          <Button onClick={makeKeys} busy={making}>
            {making ? "Generating" : held ? "Make a new pair" : "Generate key pair"}
          </Button>
          <label class="flex items-center gap-2 text-xs text-muted">
            Key size
            <select
              value={size}
              onChange={(e) =>
                setSize(Number((e.target as HTMLSelectElement).value) as ModulusSize)}
              class="border border-rule bg-inset px-2 py-1 font-mono text-xs text-ink
                     focus:border-[var(--accent)] focus:outline-none"
            >
              {MODULUS_SIZES.map((bits) => <option key={bits} value={bits}>{bits} bits</option>)}
            </select>
          </label>
        </div>
        {size === 2048 && (
          <Notice tone="info">
            2048 bits is the floor that is still considered safe. Prefer 3072 or 4096 for anything
            that must stay secret for years.
          </Notice>
        )}
        {making && size >= 4096 && (
          <Notice tone="info">
            A 4096-bit key can take several seconds to find. The tab will be busy.
          </Notice>
        )}

        <details class="group">
          <summary class="cursor-pointer text-xs text-muted underline decoration-rule underline-offset-4
                   hover:text-[var(--accent)] focus-visible:outline-none focus-visible:text-[var(--accent)]">
            Already have a private key from an earlier transfer?
          </summary>
          <div class="mt-3 space-y-3">
            <TextArea
              rows={4}
              value={pasted}
              spellcheck={false}
              placeholder="-----BEGIN PRIVATE KEY-----"
              onInput={(e) => setPasted((e.target as HTMLTextAreaElement).value)}
            />
            <Button variant="quiet" onClick={useExistingKey} disabled={pasted.trim() === ""}>
              Use this private key
            </Button>
          </div>
        </details>
        {keyError && <Notice tone="trouble">{keyError}</Notice>}
      </Step>

      <Step n={2} title="Send them the public key" state={held ? "here" : "ahead"}>
        {!held ? <p class="text-sm text-muted">Waiting on a key pair.</p> : (
          <>
            <p class="max-w-prose text-sm leading-relaxed text-muted">
              Email or message this to whoever is sending you something. It is safe in public.
            </p>
            <Plate
              name="public-key.pem"
              actions={
                <>
                  <Action onClick={() => copyPub(held.publicPem)}>
                    {copiedPub ? "Copied" : "Copy"}
                  </Action>
                  <Action onClick={() => download("public-key.pem", held.publicPem)}>Save</Action>
                </>
              }
            >
              <Verbatim value={held.publicPem} />
            </Plate>
            <div class="border-t border-rule pt-4">
              <Fingerprint value={held.fingerprint} label="Fingerprint of this public key" />
              <p class="mt-3 max-w-prose text-xs leading-relaxed text-muted">
                Read this out over a channel the sender already trusts — a phone call, or a message
                on an app you both use. If the fingerprint they see does not match, the key was
                swapped in transit and everything sealed with it can be read by whoever swapped it.
              </p>
            </div>
          </>
        )}
      </Step>

      <Step n={3} title="Keep the private key" state={held ? "here" : "ahead"}>
        {!held ? <p class="text-sm text-muted">Waiting on a key pair.</p> : held.privatePem
          ? (
            <>
              <Notice tone="guard">
                This never goes to the sender, and never to anyone else. Anyone holding it can read
                everything sent to your public key. Close this tab and it is gone — save it first if
                you are not decrypting right away.
              </Notice>
              <Plate
                name="private-key.pem"
                tone="guard"
                actions={
                  <>
                    <Action onClick={() => copyPriv(held.privatePem ?? "")}>
                      {copiedPriv ? "Copied" : "Copy"}
                    </Action>
                    <Action onClick={() => download("private-key.pem", held.privatePem ?? "")}>
                      Save
                    </Action>
                  </>
                }
              >
                <Verbatim value={held.privatePem} />
              </Plate>
            </>
          )
          : (
            <Notice tone="info">
              Using the private key you pasted. It is held in this tab only.
            </Notice>
          )}
      </Step>

      <Step n={4} title="Paste what comes back" state={held ? "here" : "ahead"}>
        <Field
          label="Sealed envelope"
          hint="The JSON the sender produced. Paste all of it, braces included."
        >
          <TextArea
            rows={8}
            value={envelopeText}
            spellcheck={false}
            disabled={!held}
            placeholder={ENVELOPE_HINT}
            onInput={(e) => setEnvelopeText((e.target as HTMLTextAreaElement).value)}
          />
        </Field>
      </Step>

      <Step n={5} title="Open it" state={opened ? "done" : held && envelopeText ? "here" : "ahead"}>
        <Button onClick={decrypt} busy={opening} disabled={!held || envelopeText.trim() === ""}>
          {opening ? "Opening" : "Decrypt"}
        </Button>
        {openError && <Notice tone="trouble">{openError}</Notice>}

        {opened && (
          <div class="space-y-4">
            <Plate
              name={opened.filename}
              actions={
                <>
                  {text !== null && (
                    <Action onClick={() => copyOut(text)}>{copiedOut ? "Copied" : "Copy"}</Action>
                  )}
                  <Action
                    onClick={() =>
                      download(opened.filename, opened.bytes, "application/octet-stream")}
                  >
                    Save
                  </Action>
                </>
              }
            >
              {text !== null ? <Verbatim value={text} /> : (
                <p class="px-3 py-4 text-xs text-muted">
                  {opened.bytes.length.toLocaleString()}{" "}
                  bytes that are not text. Save the file to read it.
                </p>
              )}
            </Plate>
            <p class="text-xs text-muted">
              Sealed {new Date(opened.envelope.createdAt).toLocaleString()} for the key ending{" "}
              <span class="font-mono">{opened.envelope.recipient.slice(-8).toUpperCase()}</span>.
              The contents arrived unaltered.
            </p>
            <Notice tone="info">
              Decryption proves nobody changed this in transit. It does not prove who sent it —
              anyone holding your public key could have sealed it.
            </Notice>
          </div>
        )}
      </Step>
    </Ledger>
  );
}
