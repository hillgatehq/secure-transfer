import { useState } from "preact/hooks";
import {
  type Envelope,
  fingerprint,
  importPublicKey,
  modulusBits,
  safeFilename,
  seal,
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
  TextInput,
  useCopy,
  Verbatim,
} from "./ui.tsx";
import { asMessage, formatBytes } from "./util.ts";

interface Recipient {
  fingerprint: string;
  bits: number;
}

export function SendFlow() {
  const [payload, setPayload] = useState("");
  const [publicPem, setPublicPem] = useState("");
  const [filename, setFilename] = useState("message.txt");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [sealing, setSealing] = useState(false);
  const [sealError, setSealError] = useState<string | null>(null);
  const [copied, copy] = useCopy();

  async function inspectKey(pem: string) {
    setPublicPem(pem);
    setRecipient(null);
    setKeyError(null);
    setEnvelope(null);
    if (pem.trim() === "") return;
    try {
      const key = await importPublicKey(pem);
      setRecipient({ fingerprint: await fingerprint(key), bits: await modulusBits(key) });
    } catch (error) {
      setKeyError(asMessage(error, "That public key could not be read."));
    }
  }

  async function encrypt() {
    setSealing(true);
    setSealError(null);
    setEnvelope(null);
    try {
      const bytes = new TextEncoder().encode(payload);
      setEnvelope(await seal(bytes, publicPem, safeFilename(filename)));
    } catch (error) {
      setSealError(asMessage(error, "The payload could not be sealed."));
    } finally {
      setSealing(false);
    }
  }

  const json = envelope ? JSON.stringify(envelope, null, 2) : "";
  const ready = payload !== "" && recipient !== null;

  return (
    <Ledger>
      <Step n={1} title="Write what you are sending" state={payload ? "done" : "here"}>
        <Field
          label="Payload"
          hint="Anything text: a password, a token, a certificate, a note. It is encrypted in this tab and never uploaded."
        >
          <TextArea
            rows={7}
            value={payload}
            spellcheck={false}
            placeholder="The secret goes here."
            onInput={(e) => setPayload((e.target as HTMLTextAreaElement).value)}
          />
        </Field>
        {payload !== "" && (
          <p class="text-xs text-muted">
            {formatBytes(new TextEncoder().encode(payload).length)} to seal.
          </p>
        )}
      </Step>

      <Step
        n={2}
        title="Paste their public key"
        state={recipient ? "done" : payload ? "here" : "ahead"}
      >
        <Field
          label="Recipient's public key"
          hint="PEM, starting -----BEGIN PUBLIC KEY-----. Only they can open what you seal with it."
        >
          <TextArea
            rows={6}
            value={publicPem}
            spellcheck={false}
            placeholder="-----BEGIN PUBLIC KEY-----"
            onInput={(e) => inspectKey((e.target as HTMLTextAreaElement).value)}
          />
        </Field>
        {keyError && <Notice tone="trouble">{keyError}</Notice>}
        {recipient && (
          <div class="border-t border-rule pt-4">
            <Fingerprint
              value={recipient.fingerprint}
              label={`Fingerprint of this ${recipient.bits}-bit key`}
            />
            <p class="mt-3 max-w-prose text-xs leading-relaxed text-muted">
              Check these digits against what the recipient reads out to you, over a channel you
              already trust. Matching them is the only thing standing between you and someone who
              substituted their own key for theirs.
            </p>
          </div>
        )}
      </Step>

      <Step n={3} title="Name the file" state={recipient ? "here" : "ahead"}>
        <Field
          label="File name"
          hint="What the payload should be called when they save it. Sent in the clear, so keep it dull."
        >
          <TextInput
            value={filename}
            spellcheck={false}
            onInput={(e) => setFilename((e.target as HTMLInputElement).value)}
          />
        </Field>
      </Step>

      <Step n={4} title="Seal it" state={envelope ? "done" : ready ? "here" : "ahead"}>
        <Button onClick={encrypt} busy={sealing} disabled={!ready}>
          {sealing ? "Sealing" : "Encrypt"}
        </Button>
        {sealError && <Notice tone="trouble">{sealError}</Notice>}

        {envelope && (
          <div class="space-y-4">
            <p class="max-w-prose text-sm leading-relaxed text-muted">
              Send this back however is convenient. It is useless to anyone without the matching
              private key, so email or chat is fine.
            </p>
            <Plate
              name="encrypted-payload.json"
              actions={
                <>
                  <Action onClick={() => copy(json)}>{copied ? "Copied" : "Copy"}</Action>
                  <Action
                    onClick={() => download("encrypted-payload.json", json, "application/json")}
                  >
                    Save
                  </Action>
                </>
              }
            >
              <Verbatim value={json} />
            </Plate>
            <Notice tone="info">
              Now forget the payload. Clear it from this tab, and from wherever you copied it,
              before you close up.
            </Notice>
          </div>
        )}
      </Step>
    </Ledger>
  );
}
