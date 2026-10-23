/** Compact run-length encoding for chunk tile/wall grids: "v:count,..." */
export function encodeRLE(values: ArrayLike<number>): string {
  if (values.length === 0) return '';
  const parts: string[] = [];
  let current = values[0];
  let count = 1;
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (v === current && count < 99999) count++;
    else {
      parts.push(`${current}:${count}`);
      current = v;
      count = 1;
    }
  }
  parts.push(`${current}:${count}`);
  return parts.join(',');
}

export function decodeRLE(str: string, expected?: number): Uint8Array {
  const out: number[] = [];
  if (str) {
    for (const part of str.split(',')) {
      const [v, c] = part.split(':');
      const value = Number(v);
      const count = Number(c);
      if (!Number.isFinite(value) || !Number.isFinite(count)) continue;
      for (let i = 0; i < count; i++) out.push(value);
    }
  }
  if (expected !== undefined) {
    while (out.length < expected) out.push(0);
    if (out.length > expected) out.length = expected;
  }
  return Uint8Array.from(out);
}
