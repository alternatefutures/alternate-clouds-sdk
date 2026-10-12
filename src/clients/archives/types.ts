/** Key-bearing operations are for trusted application backends and operators only.
 * Archive keys must never be sent to attendee/browser clients. */
export type ArchiveExecutionContext = 'trusted-backend' | 'operator';
export const ARCHIVE_VERSION = 'af.private-archive.v1' as const;
export const ARCHIVE_LIMITS = Object.freeze({
  plaintextChunkBytes: 4 * 1024 * 1024,
  ciphertextChunkBytes: 4 * 1024 * 1024 + 28,
  manifestBytes: 4 * 1024 * 1024,
  objects: 4096,
  jsonBytes: 1024 * 1024,
  bundleBytes: 16 * 1024 ** 3 + 4096 * 28,
});
export interface ArchiveScope {
  organizationId: string;
  projectId: string;
  applicationId: string;
}
export interface CipherObject {
  id: string;
  size: number;
  sha256: string;
}
export interface ArchiveSpec {
  version: typeof ARCHIVE_VERSION;
  revision: string;
  manifestObjectId: string;
  objects: CipherObject[];
  sourceExpiresAt: string | null;
  maxWinc: string;
  encryptionAttested: true;
}
export type ArchiveState =
  | 'DRAFT'
  | 'QUEUED'
  | 'FUNDING'
  | 'UPLOADING'
  | 'CONFIRMING'
  | 'STORED'
  | 'RECOVERED'
  | 'UNKNOWN'
  | 'FAILED'
  | 'CANCEL_PENDING'
  | 'CANCELLED'
  | 'EXPIRED';
export type ArchiveFileKind =
  | 'media'
  | 'hls'
  | 'caption'
  | 'transcript'
  | 'chat'
  | 'attachment';
export interface ArchiveFileSource {
  /** Portable relative POSIX path, stored only in the encrypted manifest. */
  path: string;
  mediaType: string;
  kind: ArchiveFileKind;
  source: Blob | AsyncIterable<Uint8Array> | (() => AsyncIterable<Uint8Array>);
}
export interface ArchivePlainChunk {
  objectId: string;
  size: number;
  sha256: string;
}
export interface ArchiveManifestFile {
  path: string;
  mediaType: string;
  kind: ArchiveFileKind;
  size: number;
  sha256: string;
  chunks: ArchivePlainChunk[];
}
export interface ArchiveManifest {
  version: typeof ARCHIVE_VERSION;
  scope: ArchiveScope;
  archiveId: string;
  revision: string;
  files: ArchiveManifestFile[];
}
/** Save this descriptor with protected application source metadata. It contains no key.
 * manifestSha256 is a plaintext manifest hash and MUST NOT be sent to Clouds/Arweave. */
export interface PreparedArchive {
  version: typeof ARCHIVE_VERSION;
  scope: ArchiveScope;
  archiveId: string;
  spec: ArchiveSpec;
  inventoryDigest: string;
  manifestSha256: string;
}
export interface ArchiveKeyContext {
  scope: ArchiveScope;
  archiveId: string;
  revision: string;
}
export interface PrepareArchiveOptions {
  executionContext: ArchiveExecutionContext;
  scope: ArchiveScope;
  archiveId?: string;
  revision?: string;
  sourceExpiresAt: string | null;
  maxWinc: string;
  files: Iterable<ArchiveFileSource> | AsyncIterable<ArchiveFileSource>;
  /** Persist in independent protected custody before any ciphertext is written.
   * The supplied key buffer is erased when the callback returns; copy it if needed. */
  storeKey: (key: Uint8Array, context: ArchiveKeyContext) => Promise<void>;
  /** Must durably consume each chunk before returning. Only ciphertext is supplied. */
  writeCiphertext: (objectId: string, ciphertext: Uint8Array) => Promise<void>;
}
export interface ArchivePlaybackEvidence {
  validatorVersion: string;
  evidence: unknown;
  validatedPaths: string[];
  seekChecks: { path: string; first: true; middle: true; last: true }[];
}
export interface RecoveryReport {
  version: typeof ARCHIVE_VERSION;
  inventoryDigest: string;
  objectIds: string[];
  manifestVerified: true;
  contentVerified: true;
  structureVerified: true;
  playbackVerified: true;
  evidenceDigest: string;
  validatorVersion: string;
}
export interface RecoverArchiveOptions {
  executionContext: ArchiveExecutionContext;
  prepared: PreparedArchive;
  key: Uint8Array;
  /** Independent trusted source hash; never derive this from the downloaded manifest. */
  trustedManifestSha256: string;
  readCiphertext: (objectId: string) => Promise<Uint8Array>;
  /** Write only to private temporary storage. Do not publish until recovery succeeds.
   * An empty file emits one empty chunk at index 0. */
  writePlaintext: (
    file: ArchiveManifestFile,
    chunk: Uint8Array,
    index: number,
  ) => Promise<void>;
  /** Required for every media/HLS file. Must exercise the actual decoder/player and
   * first/middle/last seeks against the reconstructed private files. */
  validatePlayback?: (context: {
    manifest: ArchiveManifest;
    inventoryDigest: string;
  }) => Promise<ArchivePlaybackEvidence>;
}
export interface ArchiveObjectContext extends ArchiveKeyContext {
  objectId: string;
}
export interface ArchiveDeliveryGrant {
  allowed: boolean;
  expiresAt: number;
}
export interface DeliverArchiveChunkOptions {
  executionContext: ArchiveExecutionContext;
  context: ArchiveObjectContext;
  key: Uint8Array;
  ciphertext: Uint8Array;
  /** Fresh application authorization; no cached grants. */
  authorize: (context: ArchiveObjectContext) => Promise<ArchiveDeliveryGrant>;
  /** Release at most this chunk, using a no-store response and deadline enforcement.
   * The SDK erases its buffer after this callback. Received bytes cannot be recalled. */
  release: (
    plaintext: Uint8Array,
    lease: { expiresAt: number; cacheControl: 'no-store'; signal: AbortSignal },
  ) => Promise<void>;
}
