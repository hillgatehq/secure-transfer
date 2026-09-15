import type { ComponentChildren, JSX } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

/* ------------------------------------------------------------ clipboard */

export function useCopy(): [boolean, (text: string) => void, string | null] {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        setError(null);
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1600);
      },
      () => setError("Your browser blocked the clipboard. Select the text and copy it by hand."),
    );
  }, []);

  return [copied, copy, error];
}

export function download(filename: string, data: string | Uint8Array, type = "text/plain"): void {
  const blob = new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* --------------------------------------------------------------- controls */

type ButtonProps = JSX.IntrinsicElements["button"] & {
  variant?: "solid" | "quiet";
  busy?: boolean;
};

export function Button({ variant = "solid", busy, children, ...rest }: ButtonProps) {
  const base = "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors " +
    "disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-paper " +
    "focus-visible:ring-[var(--accent)]";
  const look = variant === "solid"
    ? "bg-[var(--accent)] text-paper hover:brightness-110"
    : "border border-rule text-ink hover:border-[var(--accent)] hover:text-[var(--accent)]";
  return (
    <button {...rest} disabled={rest.disabled || busy} class={`${base} ${look}`}>
      {busy && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 16 16" class="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        stroke-opacity="0.3"
        stroke-width="2"
      />
      <path
        d="M8 2a6 6 0 0 1 6 6"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  );
}

/** A small text action, used in the header strip of a key or payload block. */
export function Action({ children, ...rest }: JSX.IntrinsicElements["button"]) {
  return (
    <button
      {...rest}
      class="text-xs text-muted hover:text-[var(--accent)] underline decoration-rule
             underline-offset-4 hover:decoration-[var(--accent)] transition-colors
             focus-visible:outline-none focus-visible:text-[var(--accent)]
             disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- blocks */

/** An inset plate holding verbatim material: a PEM key, an envelope, a payload. */
export function Plate(
  { name, actions, children, tone = "default" }: {
    name: string;
    actions?: ComponentChildren;
    children: ComponentChildren;
    tone?: "default" | "guard";
  },
) {
  const frame = tone === "guard" ? "border-seal/40 bg-seal/[0.04]" : "border-rule bg-inset";
  return (
    <figure class={`border ${frame}`}>
      <figcaption class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-inherit
               px-3 py-2">
        <span class="font-mono text-xs text-muted">{name}</span>
        <span class="flex items-center gap-4">{actions}</span>
      </figcaption>
      {children}
    </figure>
  );
}

export function Verbatim({ value }: { value: string }) {
  return (
    <pre
      tabIndex={0}
      class="max-h-64 min-h-[5rem] overflow-auto whitespace-pre-wrap break-all px-3 py-3
             font-mono text-[11px] leading-relaxed text-ink/80 focus-visible:outline-none"
    >{value}</pre>
  );
}

export function Field(
  { label, hint, children }: {
    label: string;
    hint?: ComponentChildren;
    children: ComponentChildren;
  },
) {
  return (
    <label class="block">
      <span class="block text-sm font-medium text-ink">{label}</span>
      {hint && <span class="mt-0.5 block text-xs leading-relaxed text-muted">{hint}</span>}
      <span class="mt-2 block">{children}</span>
    </label>
  );
}

const inputLook =
  "w-full border border-rule bg-inset px-3 py-2 text-sm text-ink placeholder:text-muted/60 " +
  "focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";

export function TextInput(props: JSX.IntrinsicElements["input"]) {
  return <input {...props} class={inputLook} />;
}

export function TextArea(props: JSX.IntrinsicElements["textarea"]) {
  return (
    <textarea {...props} class={`${inputLook} font-mono text-[11px] leading-relaxed resize-y`} />
  );
}

export function Notice(
  { tone, children }: { tone: "guard" | "info" | "trouble"; children: ComponentChildren },
) {
  const look = {
    guard: "border-seal/50 bg-seal/[0.05] text-seal",
    info: "border-rule bg-inset text-muted",
    trouble: "border-seal bg-seal/10 text-seal",
  }[tone];
  return (
    <p
      role={tone === "trouble" ? "alert" : undefined}
      class={`border-l-2 ${look} px-3 py-2 text-xs leading-relaxed`}
    >
      {children}
    </p>
  );
}

/* ------------------------------------------------------------ fingerprint */

export function Fingerprint({ value, label }: { value: string; label: string }) {
  const groups = value.toUpperCase().match(/.{1,4}/g) ?? [];
  return (
    <div>
      <p class="text-xs text-muted">{label}</p>
      <p class="mt-1 font-mono text-xs leading-6 text-ink break-words">
        {groups.map((g, i) => <span key={i} class="mr-2 inline-block">{g}</span>)}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- ledger */

export function Ledger({ children }: { children: ComponentChildren }) {
  // The trailing step needs no run-off below it, but every other step carries
  // the custody rule down to the next one.
  return <ol class="mt-12 [&>li:last-child>div]:pb-0">{children}</ol>;
}

export function Step(
  { n, title, state = "ahead", children }: {
    n: number;
    title: string;
    state?: "ahead" | "here" | "done";
    children: ComponentChildren;
  },
) {
  // Always 2px so the rule stays a single unbroken line and the content never
  // shifts as a step changes state; only the colour carries the progress.
  const rule = state === "ahead"
    ? "border-rule"
    : state === "here"
    ? "border-[var(--accent)]"
    : "border-[var(--accent)]/40";
  return (
    <li class="grid grid-cols-[1.5rem_1fr] sm:grid-cols-[2rem_1fr]">
      <div
        class={`pr-3 pt-0.5 text-right font-mono text-xs tabular-nums ${
          state === "ahead" ? "text-muted/60" : "text-[var(--accent)]"
        }`}
      >
        {n}
      </div>
      <div class={`border-l-2 ${rule} pb-12 pl-4 sm:pl-6`}>
        <h2 class="font-display text-lg font-semibold leading-snug text-ink">{title}</h2>
        <div class="mt-3 space-y-4">{children}</div>
      </div>
    </li>
  );
}
