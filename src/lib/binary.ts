/**
 * The DOM lib narrows `BufferSource` / `BlobPart` to views over `ArrayBuffer`,
 * while our byte helpers return `Uint8Array<ArrayBufferLike>` (TypeScript 5.7+
 * makes typed arrays generic over their buffer). These adapters bridge the two
 * without resorting to `any`.
 */
export function asBufferSource(data: Uint8Array): BufferSource {
  return data as unknown as BufferSource;
}

export function asBlobPart(data: Uint8Array): BlobPart {
  return data as unknown as BlobPart;
}
