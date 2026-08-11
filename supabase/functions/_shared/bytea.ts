const HEX_CHARS = '0123456789abcdefABCDEF';

export function byteaToUint8Array(raw: string): Uint8Array {
  if (typeof raw !== 'string' || raw.length < 2 || raw[0] !== '\\' || raw[1] !== 'x') {
    throw new Error('byteaToUint8Array: expected \\xHEX format');
  }

  const hex = raw.slice(2);
  if (hex.length === 0 || hex.length % 2 !== 0) {
    throw new Error('byteaToUint8Array: invalid hex length');
  }

  for (let i = 0; i < hex.length; i++) {
    if (!HEX_CHARS.includes(hex[i])) {
      throw new Error('byteaToUint8Array: invalid hex character');
    }
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}
