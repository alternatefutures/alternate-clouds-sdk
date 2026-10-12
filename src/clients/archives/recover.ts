import { sha256 as incrementalHash } from '@noble/hashes/sha256';
import {
  assert,
  digest,
  exact,
  executionContext,
  hex,
  inventoryDigest,
  opaque,
  parsePrivateJson,
  record,
  sha256,
  textDecoder,
  utf8,
  validateScope,
  validateSpec,
} from './contracts';
import { decryptObject, importArchiveKey } from './crypto';
import { validateFileDescriptor } from './prepare';
import {
  validateCaption,
  validateChat,
  validateHls,
  validateTranscript,
} from './structure';
import {
  ARCHIVE_LIMITS,
  ARCHIVE_VERSION,
  type ArchiveManifest,
  type ArchiveManifestFile,
  type PreparedArchive,
  type RecoverArchiveOptions,
  type RecoveryReport,
} from './types';

/** Validate a protected local descriptor before reading object paths or sending its spec. */
export function validatePreparedArchive(value: unknown): PreparedArchive {
  const r = record(value);
  exact(r, [
    'version',
    'scope',
    'archiveId',
    'spec',
    'inventoryDigest',
    'manifestSha256',
  ]);
  assert(r.version === ARCHIVE_VERSION, 'unsupported_archive');
  exact(record(r.scope), ['organizationId', 'projectId', 'applicationId']);
  const prepared = r as unknown as PreparedArchive;
  validateScope(prepared.scope);
  opaque(prepared.archiveId);
  digest(prepared.inventoryDigest);
  digest(prepared.manifestSha256);
  const spec = validateSpec(prepared.spec);
  assert(
    inventoryDigest(prepared.scope, prepared.archiveId, spec) ===
      prepared.inventoryDigest,
    'inventory_digest_mismatch',
  );
  return { ...prepared, scope: { ...prepared.scope }, spec };
}
function parseManifest(
  bytes: Uint8Array,
  prepared: PreparedArchive,
): ArchiveManifest {
  const value = record(parsePrivateJson(textDecoder.decode(bytes)));
  exact(value, ['version', 'scope', 'archiveId', 'revision', 'files']);
  const manifest = value as unknown as ArchiveManifest;
  exact(record(manifest.scope), [
    'organizationId',
    'projectId',
    'applicationId',
  ]);
  assert(
    manifest.version === ARCHIVE_VERSION &&
      manifest.archiveId === prepared.archiveId &&
      manifest.revision === prepared.spec.revision &&
      manifest.scope.organizationId === prepared.scope.organizationId &&
      manifest.scope.projectId === prepared.scope.projectId &&
      manifest.scope.applicationId === prepared.scope.applicationId,
    'manifest_context_mismatch',
  );
  assert(
    Array.isArray(manifest.files) &&
      manifest.files.length > 0 &&
      manifest.files.length <= ARCHIVE_LIMITS.objects,
    'invalid_manifest_files',
  );
  const paths = new Set<string>();
  const ids = new Set<string>([prepared.spec.manifestObjectId]);
  const inventory = new Map(prepared.spec.objects.map((o) => [o.id, o]));
  for (const file of manifest.files) {
    exact(record(file), [
      'path',
      'mediaType',
      'kind',
      'size',
      'sha256',
      'chunks',
    ]);
    validateFileDescriptor(file);
    digest(file.sha256);
    assert(!paths.has(file.path), 'duplicate_file_path');
    paths.add(file.path);
    assert(
      Number.isSafeInteger(file.size) &&
        file.size >= 0 &&
        Array.isArray(file.chunks),
      'invalid_manifest_file',
    );
    if (['hls', 'caption', 'transcript', 'chat'].includes(file.kind))
      assert(
        file.size <= ARCHIVE_LIMITS.plaintextChunkBytes,
        'structured_file_too_large',
      );
    let size = 0;
    for (const chunk of file.chunks) {
      exact(record(chunk), ['objectId', 'size', 'sha256']);
      opaque(chunk.objectId);
      digest(chunk.sha256);
      assert(
        !ids.has(chunk.objectId) &&
          Number.isSafeInteger(chunk.size) &&
          chunk.size > 0 &&
          chunk.size <= ARCHIVE_LIMITS.plaintextChunkBytes,
        'invalid_manifest_chunk',
      );
      assert(
        inventory.get(chunk.objectId)?.size === chunk.size + 28,
        'manifest_inventory_mismatch',
      );
      ids.add(chunk.objectId);
      size += chunk.size;
    }
    assert(size === file.size, 'manifest_length_mismatch');
  }
  assert(
    ids.size === inventory.size &&
      [...inventory.keys()].every((id) => ids.has(id)),
    'incomplete_manifest_inventory',
  );
  // Nested path collisions would otherwise allow unsafe reconstruction destinations.
  for (const path of paths) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++)
      assert(
        !paths.has(parts.slice(0, i).join('/')),
        'file_directory_collision',
      );
  }
  return manifest;
}
/** Application-attested recovery: all ciphertext, plaintext, structure and required
 * playback checks must pass. Partial output must remain private and be discarded. */
export async function recoverArchive(
  options: RecoverArchiveOptions,
): Promise<RecoveryReport> {
  executionContext(options.executionContext);
  const prepared = validatePreparedArchive(options.prepared);
  digest(options.trustedManifestSha256);
  assert(
    options.trustedManifestSha256 === prepared.manifestSha256,
    'trusted_manifest_mismatch',
  );
  const key = await importArchiveKey(options.key);
  const objects = new Map(prepared.spec.objects.map((o) => [o.id, o]));
  const read = async (objectId: string) => {
    const object = objects.get(objectId);
    assert(object, 'missing_inventory_object');
    const bytes = await options.readCiphertext(objectId);
    assert(
      bytes instanceof Uint8Array &&
        bytes.length === object.size &&
        sha256(bytes) === object.sha256,
      'ciphertext_integrity_failed',
    );
    return decryptObject(key, bytes, {
      scope: prepared.scope,
      archiveId: prepared.archiveId,
      revision: prepared.spec.revision,
      objectId,
    });
  };
  const manifestObject = objects.get(prepared.spec.manifestObjectId);
  assert(
    manifestObject && manifestObject.size <= ARCHIVE_LIMITS.manifestBytes,
    'manifest_too_large',
  );
  const manifestBytes = await read(prepared.spec.manifestObjectId);
  let manifest: ArchiveManifest;
  try {
    assert(
      sha256(manifestBytes) === options.trustedManifestSha256,
      'trusted_manifest_mismatch',
    );
    manifest = parseManifest(manifestBytes, prepared);
  } finally {
    manifestBytes.fill(0);
  }
  const files = new Map(manifest.files.map((file) => [file.path, file]));
  const media = manifest.files.filter(
    (file) => file.kind === 'media' || file.kind === 'hls',
  );
  assert(
    media.length === 0 || typeof options.validatePlayback === 'function',
    'playback_validator_required',
  );
  const verifiedIds: string[] = [prepared.spec.manifestObjectId];
  for (const file of manifest.files) {
    const hash = incrementalHash.create();
    const structured = ['hls', 'caption', 'transcript', 'chat'].includes(
      file.kind,
    );
    const textBytes = structured ? new Uint8Array(file.size) : undefined;
    let length = 0;
    try {
      if (file.chunks.length === 0)
        await options.writePlaintext(file, new Uint8Array(), 0);
      for (let index = 0; index < file.chunks.length; index++) {
        const chunk = file.chunks[index];
        assert(chunk, 'missing_manifest_chunk');
        const bytes = await read(chunk.objectId);
        try {
          assert(
            bytes.length === chunk.size && sha256(bytes) === chunk.sha256,
            'plaintext_integrity_failed',
          );
          hash.update(bytes);
          textBytes?.set(bytes, length);
          length += bytes.length;
          await options.writePlaintext(file, bytes, index);
          verifiedIds.push(chunk.objectId);
        } finally {
          bytes.fill(0);
        }
      }
      assert(
        length === file.size && hex(hash.digest()) === file.sha256,
        'file_integrity_failed',
      );
      if (textBytes) {
        const text = textDecoder.decode(textBytes);
        if (file.kind === 'hls') validateHls(file, text, files);
        if (file.kind === 'caption') validateCaption(text);
        if (file.kind === 'transcript') validateTranscript(text);
        if (file.kind === 'chat') validateChat(text, file.mediaType);
      }
    } finally {
      hash.destroy();
      textBytes?.fill(0);
    }
  }
  assert(verifiedIds.length === objects.size, 'incomplete_recovery');
  let playback: unknown = { applicability: 'no-media' };
  if (media.length > 0) {
    const result = await options.validatePlayback?.({
      manifest,
      inventoryDigest: prepared.inventoryDigest,
    });
    assert(
      result &&
        typeof result.validatorVersion === 'string' &&
        /^[A-Za-z0-9._-]{1,80}$/.test(result.validatorVersion),
      'invalid_playback_evidence',
    );
    assert(
      Array.isArray(result.validatedPaths) && Array.isArray(result.seekChecks),
      'incomplete_playback_evidence',
    );
    assert(
      result.evidence &&
        typeof result.evidence === 'object' &&
        Object.keys(result.evidence).length > 0,
      'missing_playback_evidence',
    );
    assert(
      new Set(result.validatedPaths).size === result.validatedPaths.length &&
        result.validatedPaths.every((path) => files.has(path)),
      'invalid_playback_paths',
    );
    for (const file of media) {
      const checks = result.seekChecks.filter(
        (check) => check.path === file.path,
      );
      assert(
        result.validatedPaths.includes(file.path) &&
          checks.length === 1 &&
          checks[0]?.first === true &&
          checks[0]?.middle === true &&
          checks[0]?.last === true,
        'incomplete_playback_evidence',
      );
    }
    playback = result;
  }
  const evidence = JSON.stringify({
    validator: 'af.archive-sdk.v1',
    inventoryDigest: prepared.inventoryDigest,
    manifestSha256: prepared.manifestSha256,
    files: manifest.files.map((file) => [file.path, file.size, file.sha256]),
    playback,
  });
  assert(
    utf8.encode(evidence).length <= ARCHIVE_LIMITS.jsonBytes,
    'recovery_evidence_too_large',
  );
  return {
    version: ARCHIVE_VERSION,
    inventoryDigest: prepared.inventoryDigest,
    objectIds: verifiedIds.sort(),
    manifestVerified: true,
    contentVerified: true,
    structureVerified: true,
    playbackVerified: true,
    evidenceDigest: sha256(evidence),
    validatorVersion: 'af.archive-sdk.v1',
  };
}
