/**
 * Decodes a Base64-encoded chunk of raw PTY bytes into a Uint8Array so xterm.js
 * can decode UTF-8 across chunk boundaries.
 */
export function decodeBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}
