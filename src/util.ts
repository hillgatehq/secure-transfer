import { TransferError } from "./crypto.ts";

/**
 * TransferError messages are written for people and are safe to show. Anything
 * else is reported as the caller's plain-language fallback, so a WebCrypto
 * DOMException never reaches the interface as jargon.
 */
export function asMessage(error: unknown, fallback: string): string {
  if (error instanceof TransferError) return error.message;
  console.error(error);
  return fallback;
}

/** Decode as UTF-8, or return null when the bytes are not text. */
export function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
