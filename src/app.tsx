import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { ReceiveFlow } from "./receive.tsx";
import { SendFlow } from "./send.tsx";

type Route = "home" | "receive" | "send";

/** Each flow carries its own ink; the class sets the --accent custom property. */
const ACCENT: Record<Route, string> = {
  home: "ink-receive",
  receive: "ink-receive",
  send: "ink-send",
};

function readRoute(): Route {
  const hash = location.hash.replace("#", "");
  return hash === "receive" || hash === "send" ? hash : "home";
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      globalThis.scrollTo({ top: 0 });
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  if (!globalThis.crypto?.subtle) {
    return (
      <Shell accent={ACCENT.home}>
        <div class="py-24">
          <h1 class="font-display text-3xl font-semibold text-ink">This page needs WebCrypto</h1>
          <p class="mt-4 max-w-prose leading-relaxed text-muted">
            Your browser did not expose{" "}
            <code class="font-mono text-sm">crypto.subtle</code>, which is what does the encrypting
            here. That normally means the page was opened over plain http or from a file. Open it
            over https and it will work.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell accent={ACCENT[route]}>
      {route === "home" ? <Home /> : <Flow route={route} />}
    </Shell>
  );
}

function Shell({ accent, children }: { accent: string; children: ComponentChildren }) {
  return (
    <div class={accent}>
      <header class="border-b border-rule">
        <div class="mx-auto flex max-w-3xl items-baseline justify-between px-5 py-4">
          <a
            href="#"
            class="font-display text-base font-semibold tracking-tight text-ink
                   focus-visible:outline-none focus-visible:text-[var(--accent)]"
          >
            Secure transfer
          </a>
          <span class="font-mono text-[11px] text-muted">RSA-OAEP + AES-256-GCM</span>
        </div>
      </header>
      <main class="mx-auto max-w-3xl px-5">{children}</main>
      <Footer />
    </div>
  );
}

function Home() {
  return (
    <div class="py-16 sm:py-24">
      <h1 class="font-display text-4xl font-semibold leading-[1.15] tracking-tight text-ink sm:text-5xl">
        Hand something over<br />without trusting the channel.
      </h1>
      <p class="mt-6 max-w-[54ch] text-base leading-relaxed text-muted">
        The person receiving makes a key pair and sends out the public half. The person sending
        seals the payload to that key. Only the private half, which never moves, can open it. All of
        it happens in your browser.
      </p>

      <Diagram />

      <div class="mt-12 grid gap-px border-y border-rule bg-rule sm:grid-cols-2">
        <Role
          href="#receive"
          accent="ink-receive"
          title="I need to receive something"
          detail="Make a key pair, pass out the public key, then open what comes back."
        />
        <Role
          href="#send"
          accent="ink-send"
          title="I need to send something"
          detail="Take their public key, seal your payload to it, hand back the envelope."
        />
      </div>
    </div>
  );
}

function Role(
  { href, accent, title, detail }: { href: string; accent: string; title: string; detail: string },
) {
  return (
    <a
      href={href}
      class={`${accent} group flex flex-col gap-2 border-l-2 border-[var(--accent)] bg-paper p-6
             transition-colors hover:bg-inset
             focus-visible:outline-none focus-visible:bg-inset`}
    >
      <h2 class="font-display text-xl font-semibold text-ink group-hover:text-[var(--accent)]">
        {title}
      </h2>
      <p class="text-sm leading-relaxed text-muted">{detail}</p>
    </a>
  );
}

/** The protocol itself: one key travels out in the open, one envelope comes back sealed. */
function Diagram() {
  return (
    <svg
      viewBox="0 0 680 150"
      class="mt-12 w-full"
      role="img"
      aria-label="The recipient sends their public key to the sender, and the sender returns a sealed envelope."
    >
      <defs>
        <marker
          id="tip-green"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M0 0.5 L7.5 4 L0 7.5" fill="none" stroke="#1F5D4C" stroke-width="1.2" />
        </marker>
        <marker
          id="tip-red"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M0 0.5 L7.5 4 L0 7.5" fill="none" stroke="#7A2E3B" stroke-width="1.2" />
        </marker>
      </defs>

      <Plate x={0} label="You" sub="hold the key pair" />
      <Plate x={492} label="Them" sub="seal the payload" />

      <line x1={200} y1={58} x2={470} y2={58} stroke="#1F5D4C" marker-end="url(#tip-green)" />
      <text x={335} y={48} text-anchor="middle" class="fill-[#1F5D4C]" font-size="12.5">
        public key, in the open
      </text>

      <line x1={470} y1={96} x2={200} y2={96} stroke="#7A2E3B" marker-end="url(#tip-red)" />
      <text x={335} y={114} text-anchor="middle" class="fill-[#7A2E3B]" font-size="12.5">
        sealed envelope, unreadable in transit
      </text>
    </svg>
  );
}

function Plate({ x, label, sub }: { x: number; label: string; sub: string }) {
  return (
    <g>
      <rect x={x + 1} y={22} width={186} height={106} fill="#F3F4F0" stroke="#B9C0B6" />
      <rect
        x={x + 7}
        y={28}
        width={174}
        height={94}
        fill="none"
        stroke="#B9C0B6"
        stroke-dasharray="1 3"
      />
      <text
        x={x + 94}
        y={70}
        text-anchor="middle"
        class="fill-[#17201C]"
        font-size="19"
        font-weight="600"
      >
        {label}
      </text>
      <text x={x + 94} y={92} text-anchor="middle" class="fill-[#5C6660]" font-size="12.5">
        {sub}
      </text>
    </g>
  );
}

function Flow({ route }: { route: "receive" | "send" }) {
  const heading = route === "receive"
    ? {
      title: "Receiving something",
      lede:
        "Five steps. Nothing leaves this tab except the public key and, at the end, whatever you save.",
    }
    : {
      title: "Sending something",
      lede:
        "Four steps. The payload is encrypted here; only the sealed envelope is meant to travel.",
    };

  return (
    <div class="py-12 sm:py-16">
      <a
        href="#"
        class="font-mono text-xs text-muted underline decoration-rule underline-offset-4
               hover:text-[var(--accent)] focus-visible:outline-none focus-visible:text-[var(--accent)]"
      >
        Back
      </a>
      <h1 class="mt-6 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {heading.title}
      </h1>
      <p class="mt-4 max-w-[58ch] leading-relaxed text-muted">{heading.lede}</p>
      {route === "receive" ? <ReceiveFlow /> : <SendFlow />}
    </div>
  );
}

function Footer() {
  return (
    <footer class="mt-20 border-t border-rule">
      <div class="mx-auto max-w-3xl px-5 py-8">
        <p class="max-w-prose text-xs leading-relaxed text-muted">
          Everything runs in your browser. Nothing is uploaded, stored or logged — there is no
          server to send it to. Save this page and it keeps working with the network off.
        </p>
        <p class="mt-3 text-xs text-muted">
          <a
            href="https://github.com/hillgatehq/secure-transfer"
            class="underline decoration-rule underline-offset-4 hover:text-[var(--accent)]"
          >
            Source and threat model
          </a>
        </p>
      </div>
    </footer>
  );
}
