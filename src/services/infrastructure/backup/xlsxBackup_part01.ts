export const INFO_SHEET = 'معلومات النسخة';

export const PAYLOAD_SHEET = '_CERAMISYS_BACKUP';

export const PAYLOAD_MARKER = 'CERAMISYS_SQLITE_BACKUP';

export const PAYLOAD_VERSION = '1';

export const PAYLOAD_START_ROW = 4;

export const MAX_BASE64_CELL_LENGTH = 32_000;

export const RAW_CHUNK_SIZE = 24_000;

export const OLE_SIGNATURE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function hasOfficeCompoundFileSignature(bytes: Uint8Array): boolean {
  return bytes.length >= OLE_SIGNATURE.length &&
    OLE_SIGNATURE.every((byte, index) => bytes[index] === byte);
}
