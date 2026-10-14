import { sha256 as incrementalHash } from '@noble/hashes/sha256';
import {
  assert,
  executionContext,
  hex,
  inventoryDigest,
  opaque,
  safePath,
  sha256,
  utf8,
  validateScope,
  validateSpec,
} from './contracts';
import { encryptObject, importArchiveKey } from './crypto';
import {
  ARCHIVE_LIMITS,
  ARCHIVE_VERSION,
  type ArchiveFileSource,
  type ArchiveManifest,
  type ArchiveManifestFile,
  type CipherObject,
  type PrepareArchiveOptions,
  type PreparedArchive,
} from './types';

const kinds = ['media', 'hls', 'caption', 'transcript', 'chat', 'attachment'];
export function validateFileDescriptor(
  file: Pick<ArchiveManifestFile, 'path' | 'mediaType' | 'kind'>,
): void {
  safePath(file.path);
  assert(
    typeof file.mediaType === 'string' &&
      /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(file.mediaType),
    'invalid_media_type',
  );
  assert(kinds.includes(file.kind), 'invalid_file_kind');
  const lowerPath = file.path.toLowerCase();
  if (lowerPath.endsWith('.m3u8') || /mpegurl/i.test(file.mediaType))
    assert(file.kind === 'hls', 'incorrect_file_kind');
  if (lowerPath.endsWith('.vtt') || file.mediaType === 'text/vtt')
    assert(file.kind === 'caption', 'incorrect_file_kind');
  if (
    /^(audio|video)\//.test(file.mediaType) &&
    !/mpegurl/i.test(file.mediaType)
  )
    assert(file.kind === 'media', 'incorrect_file_kind');
}
async function* sourceBytes(
  file: ArchiveFileSource,
): AsyncGenerator<Uint8Array> {
  const source =
    typeof file.source === 'function'
      ? (file.source as () => AsyncIterable<Uint8Array>)()
      : file.source;
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    const reader = source.stream().getReader();
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        yield next.value;
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  } else {
    assert(source && Symbol.asyncIterator in source, 'invalid_file_source');
    yield* source as AsyncIterable<Uint8Array>;
  }
}
/** Encrypt one bounded chunk at a time; no plaintext bundle is accumulated. */
export async function prepareArchive(
  options: PrepareArchiveOptions,
): Promise<PreparedArchive> {
  executionContext(options.executionContext);
  validateScope(options.scope);
  const scope = { ...options.scope };
  const archiveId = options.archiveId ?? crypto.randomUUID();
  const revision = options.revision ?? crypto.randomUUID();
  opaque(archiveId);
  opaque(revision);
  assert(
    typeof options.storeKey === 'function' &&
      typeof options.writeCiphertext === 'function',
    'archive_sinks_required',
  );
  assert(
    typeof options.maxWinc === 'string' &&
      /^(0|[1-9][0-9]{0,29})$/.test(options.maxWinc),
    'invalid_winc',
  );
  assert(
    options.sourceExpiresAt === null ||
      (typeof options.sourceExpiresAt === 'string' &&
        Number.isFinite(Date.parse(options.sourceExpiresAt)) &&
        new Date(options.sourceExpiresAt).toISOString() ===
          options.sourceExpiresAt),
    'invalid_expiry',
  );
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const key = await importArchiveKey(keyBytes);
  try {
    await options.storeKey(keyBytes, { scope, archiveId, revision });
  } finally {
    keyBytes.fill(0);
  }
  const manifest: ArchiveManifest = {
    version: ARCHIVE_VERSION,
    scope,
    archiveId,
    revision,
    files: [],
  };
  const objects: CipherObject[] = [];
  const paths = new Set<string>();
  // Keep only file paths, not every directory prefix of each long path.
  const orderedPaths: string[] = [];
  const pathPosition = (path: string): number => {
    let low = 0;
    let high = orderedPaths.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if ((orderedPaths[middle] ?? '') < path) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  let totalCiphertextBytes = 0;
  const save = async (plaintext: Uint8Array): Promise<CipherObject> => {
    assert(objects.length < ARCHIVE_LIMITS.objects, 'too_many_objects');
    const id = crypto.randomUUID();
    const bytes = await encryptObject(key, plaintext, {
      scope,
      archiveId,
      revision,
      objectId: id,
    });
    totalCiphertextBytes += bytes.length;
    assert(
      totalCiphertextBytes <= ARCHIVE_LIMITS.bundleBytes,
      'bundle_too_large',
    );
    const object = { id, size: bytes.length, sha256: sha256(bytes) };
    await options.writeCiphertext(id, bytes);
    objects.push(object);
    return object;
  };
  for await (const file of options.files) {
    validateFileDescriptor(file);
    assert(
      !paths.has(file.path) && paths.size < ARCHIVE_LIMITS.objects,
      'invalid_file_inventory',
    );
    const prefix = `${file.path}/`;
    assert(
      !orderedPaths[pathPosition(prefix)]?.startsWith(prefix),
      'file_directory_collision',
    );
    const parts = file.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('/');
      assert(!paths.has(parent), 'file_directory_collision');
    }
    orderedPaths.splice(pathPosition(file.path), 0, file.path);
    paths.add(file.path);
    const item: ArchiveManifestFile = {
      path: file.path,
      mediaType: file.mediaType,
      kind: file.kind,
      size: 0,
      sha256: '',
      chunks: [],
    };
    const hash = incrementalHash.create();
    const buffer = new Uint8Array(ARCHIVE_LIMITS.plaintextChunkBytes);
    let offset = 0;
    const flush = async () => {
      assert(objects.length < ARCHIVE_LIMITS.objects - 1, 'too_many_objects');
      const bytes = buffer.subarray(0, offset);
      const chunkHash = sha256(bytes);
      const object = await save(bytes);
      item.chunks.push({
        objectId: object.id,
        size: bytes.length,
        sha256: chunkHash,
      });
      buffer.fill(0);
      offset = 0;
    };
    try {
      for await (const source of sourceBytes(file)) {
        assert(
          source instanceof Uint8Array &&
            source.length <= ARCHIVE_LIMITS.plaintextChunkBytes,
          'source_chunk_too_large',
        );
        hash.update(source);
        item.size += source.length;
        if (['hls', 'caption', 'transcript', 'chat'].includes(item.kind))
          assert(
            item.size <= ARCHIVE_LIMITS.plaintextChunkBytes,
            'structured_file_too_large',
          );
        let position = 0;
        while (position < source.length) {
          const take = Math.min(
            buffer.length - offset,
            source.length - position,
          );
          buffer.set(source.subarray(position, position + take), offset);
          offset += take;
          position += take;
          if (offset === buffer.length) await flush();
        }
      }
      if (offset > 0) await flush();
      item.sha256 = hex(hash.digest());
      manifest.files.push(item);
      assert(
        utf8.encode(JSON.stringify(manifest)).length <=
          ARCHIVE_LIMITS.manifestBytes - 28,
        'manifest_too_large',
      );
    } finally {
      buffer.fill(0);
      hash.destroy();
    }
  }
  assert(objects.length > 0 && manifest.files.length > 0, 'empty_archive');
  const manifestBytes = utf8.encode(JSON.stringify(manifest));
  let manifestObject: CipherObject;
  const manifestSha256 = sha256(manifestBytes);
  try {
    manifestObject = await save(manifestBytes);
  } finally {
    manifestBytes.fill(0);
  }
  const spec = validateSpec({
    version: ARCHIVE_VERSION,
    revision,
    manifestObjectId: manifestObject.id,
    objects,
    sourceExpiresAt: options.sourceExpiresAt,
    maxWinc: options.maxWinc,
    encryptionAttested: true,
  });
  return {
    version: ARCHIVE_VERSION,
    scope,
    archiveId,
    spec,
    inventoryDigest: inventoryDigest(scope, archiveId, spec),
    manifestSha256,
  };
}
