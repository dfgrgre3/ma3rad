/** Browser replacement for the small Node crypto surface used by bcryptjs 2.x. */
export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}
