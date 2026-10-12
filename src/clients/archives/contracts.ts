import { sha256 as hash } from '@noble/hashes/sha256';
import {
  ARCHIVE_LIMITS,
  ARCHIVE_VERSION,
  type ArchiveExecutionContext,
  type ArchiveObjectContext,
  type ArchiveScope,
  type ArchiveSpec,
} from './types';
export class ArchiveError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
  ) {
    super(code);
    this.name = 'ArchiveError';
  }
}
export const utf8 = new TextEncoder();
export const textDecoder = new TextDecoder('utf-8', { fatal: true });
export function sha256(value: Uint8Array | string): string {
  return hex(hash(typeof value === 'string' ? utf8.encode(value) : value));
}
export function hex(value: Uint8Array): string {
  return Array.from(value, (b) => b.toString(16).padStart(2, '0')).join('');
}
export function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new ArchiveError(code);
}
export function opaque(value: unknown): asserts value is string {
  assert(
    typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        value,
      ),
    'invalid_opaque_id',
  );
}
export function binding(value: unknown): asserts value is string {
  assert(
    typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value),
    'invalid_binding_id',
  );
}
export function digest(value: unknown): asserts value is string {
  assert(
    typeof value === 'string' && /^[0-9a-f]{64}$/.test(value),
    'invalid_digest',
  );
}
export function validateScope(scope: ArchiveScope): void {
  binding(scope.organizationId);
  binding(scope.projectId);
  binding(scope.applicationId);
}
export function executionContext(value: ArchiveExecutionContext): void {
  // Existing non-archive SDK clients retain their older Node support. These
  // new key-bearing helpers require unflagged WebCrypto in ordinary files.
  const nodeVersion = (
    globalThis as { process?: { versions?: { node?: string } } }
  ).process?.versions?.node;
  if (nodeVersion) {
    const [major = 0, minor = 0] = nodeVersion.split('.').map(Number);
    assert(
      major > 20 || (major === 20 && minor >= 17),
      'archive_node_20_17_required',
    );
  }
  assert(
    typeof globalThis.crypto !== 'undefined' &&
      !!globalThis.crypto.subtle &&
      typeof globalThis.crypto.getRandomValues === 'function',
    'archive_webcrypto_required',
  );
  assert(
    value === 'operator' || value === 'trusted-backend',
    'trusted_execution_context_required',
  );
}
export function record(value: unknown): Record<string, unknown> {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    'invalid_object',
  );
  return value as Record<string, unknown>;
}
export function exact(value: Record<string, unknown>, keys: string[]): void {
  assert(
    Object.keys(value).every((k) => keys.includes(k)) &&
      keys.every((k) => k in value),
    'unexpected_fields',
  );
}
export function validateSpec(spec: ArchiveSpec): ArchiveSpec {
  const s = record(spec);
  exact(s, [
    'version',
    'revision',
    'manifestObjectId',
    'objects',
    'sourceExpiresAt',
    'maxWinc',
    'encryptionAttested',
  ]);
  assert(
    spec.version === ARCHIVE_VERSION && spec.encryptionAttested === true,
    'unsupported_archive',
  );
  opaque(spec.revision);
  opaque(spec.manifestObjectId);
  assert(
    typeof spec.maxWinc === 'string' &&
      /^(0|[1-9][0-9]{0,29})$/.test(spec.maxWinc),
    'invalid_winc',
  );
  assert(
    spec.sourceExpiresAt === null ||
      (typeof spec.sourceExpiresAt === 'string' &&
        Number.isFinite(Date.parse(spec.sourceExpiresAt)) &&
        new Date(spec.sourceExpiresAt).toISOString() === spec.sourceExpiresAt),
    'invalid_expiry',
  );
  assert(
    Array.isArray(spec.objects) &&
      spec.objects.length >= 2 &&
      spec.objects.length <= ARCHIVE_LIMITS.objects,
    'invalid_inventory',
  );
  const objects = spec.objects
    .map((o) => {
      exact(record(o), ['id', 'size', 'sha256']);
      opaque(o.id);
      digest(o.sha256);
      assert(
        Number.isSafeInteger(o.size) &&
          o.size >= 29 &&
          o.size <= ARCHIVE_LIMITS.ciphertextChunkBytes,
        'invalid_object_size',
      );
      return { ...o };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  assert(
    new Set(objects.map((o) => o.id)).size === objects.length &&
      objects.some((o) => o.id === spec.manifestObjectId),
    'invalid_inventory',
  );
  assert(
    objects.reduce((sum, o) => sum + o.size, 0) <= ARCHIVE_LIMITS.bundleBytes,
    'bundle_too_large',
  );
  const manifest = objects.find((o) => o.id === spec.manifestObjectId);
  assert(
    manifest && manifest.size <= ARCHIVE_LIMITS.manifestBytes,
    'manifest_too_large',
  );
  const result = { ...spec, objects };
  assert(
    utf8.encode(JSON.stringify(result)).length <= ARCHIVE_LIMITS.jsonBytes,
    'inventory_too_large',
  );
  return result;
}
export function inventoryDigest(
  scope: ArchiveScope,
  archiveId: string,
  spec: ArchiveSpec,
): string {
  validateScope(scope);
  opaque(archiveId);
  const s = validateSpec(spec);
  return sha256(
    JSON.stringify([
      ARCHIVE_VERSION,
      scope.organizationId,
      scope.projectId,
      scope.applicationId,
      archiveId,
      s.revision,
      s.manifestObjectId,
      s.sourceExpiresAt,
      s.maxWinc,
      s.objects.map((o) => [o.id, o.size, o.sha256]),
    ]),
  );
}
export function objectAad(context: ArchiveObjectContext): Uint8Array {
  validateScope(context.scope);
  opaque(context.archiveId);
  opaque(context.revision);
  opaque(context.objectId);
  return utf8.encode(
    JSON.stringify([
      ARCHIVE_VERSION,
      context.scope.organizationId,
      context.scope.projectId,
      context.scope.applicationId,
      context.archiveId,
      context.revision,
      context.objectId,
    ]),
  );
}
export function safePath(value: unknown): asserts value is string {
  assert(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 1024 &&
      !/[\\:%?#]/.test(value) &&
      ![...value].some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      ) &&
      !value.startsWith('/') &&
      value
        .split('/')
        .every((part) => part !== '' && part !== '.' && part !== '..'),
    'invalid_file_path',
  );
}

/** Avoid JSON parser errors that quote protected plaintext in exception messages. */
export function parsePrivateJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ArchiveError('invalid_private_json');
  }
}
