import {
  assert,
  ArchiveError,
  binding,
  digest,
  exact,
  opaque,
  record,
  textDecoder,
  utf8,
  validateSpec,
} from './contracts';
import {
  ARCHIVE_LIMITS,
  ARCHIVE_VERSION,
  type ArchiveScope,
  type ArchiveSpec,
  type ArchiveState,
  type CipherObject,
  type RecoveryReport,
} from './types';

export interface ArchiveClientOptions {
  /** API origin (HTTPS). Plain HTTP is accepted only for explicit loopback tests. */
  apiUrl: string;
  /** Existing AccessTokenService implementations satisfy this interface. */
  accessTokenService: { getAccessToken: () => Promise<string> };
  projectId: string;
  applicationId: string;
  allowInsecureLoopback?: boolean;
  fetch?: typeof globalThis.fetch;
}
export interface ArchiveCapabilities {
  version: typeof ARCHIVE_VERSION;
  receiptFormatVersion: 'af.private-archive-receipt.v1';
  available: boolean;
  scope: ArchiveScope;
  limits: {
    plaintextChunkBytes: number;
    ciphertextChunkBytes: number;
    objects: number;
    jsonBytes: number;
    bundleBytes: number;
  } & Record<string, number>;
  reason: string | null;
  permanent: true;
  keys: 'application-owned';
  recovery: 'application-attested';
  providerEvidenceRequired: true;
}
export interface ArchiveStatus {
  version: typeof ARCHIVE_VERSION;
  receiptFormatVersion: 'af.private-archive-receipt.v1';
  archiveId: string;
  scope: ArchiveScope;
  revision: string;
  inventoryDigest: string;
  state: ArchiveState;
  stageExpiresAt: string;
  sourceExpiresAt: string | null;
  maxWinc: string;
  estimatedWinc: string | null;
  estimatedAt: string | null;
  reason: string | null;
  recovery: RecoveryReport | null;
  grantTransactionId?: string | null;
  fundingReceipt?: unknown | null;
  objectCount: number;
  nextCursor: number | null;
  objects: (CipherObject & {
    state:
      | 'MISSING'
      | 'STAGED'
      | 'PREPARED'
      | 'SUBMITTING'
      | 'ACCEPTED'
      | 'CONFIRMED';
    transactionId: string | null;
    receipt: unknown | null;
    confirmedAt: string | null;
  })[];
}
export type ArchiveReconciliation =
  | { objectId: string; receipt: unknown }
  | { retryConfirmation: true }
  | { fundingReceipt: unknown }
  | { resume: true };
async function boundedBytes(
  response: Response,
  limit: number,
): Promise<Uint8Array> {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
    await response.body?.cancel();
    throw new ArchiveError('archive_response_too_large');
  }
  assert(response.body, 'archive_empty_response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      assert(size <= limit, 'archive_response_too_large');
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
/** Authenticated ciphertext catalog client. No plaintext, keys or file metadata are
 * accepted by create/upload. This client performs no paid-operation retries. */
export class ArchiveClient {
  private readonly url: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly tokens: ArchiveClientOptions['accessTokenService'];
  private readonly projectId: string;
  private readonly applicationId: string;
  constructor(options: ArchiveClientOptions) {
    const url = new URL(options.apiUrl);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    assert(
      url.protocol === 'https:' ||
        (options.allowInsecureLoopback === true &&
          loopback &&
          url.protocol === 'http:'),
      'archive_https_required',
    );
    assert(
      !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === '/',
      'archive_api_origin_required',
    );
    binding(options.projectId);
    binding(options.applicationId);
    assert(
      options.accessTokenService &&
        typeof options.accessTokenService.getAccessToken === 'function',
      'archive_authentication_required',
    );
    this.url = `${url.origin}/v1/archives/projects/${encodeURIComponent(options.projectId)}/applications/${encodeURIComponent(options.applicationId)}`;
    this.projectId = options.projectId;
    this.applicationId = options.applicationId;
    this.tokens = options.accessTokenService;
    this.fetcher = options.fetch ?? globalThis.fetch;
  }
  private path(archiveId: string): string {
    opaque(archiveId);
    return `/${archiveId}`;
  }
  private async request(
    method: string,
    path: string,
    body?: unknown,
    binary = false,
  ): Promise<unknown> {
    const token = await this.tokens.getAccessToken();
    assert(
      typeof token === 'string' && token.length > 0,
      'archive_authentication_required',
    );
    let payload: string | Uint8Array | undefined;
    if (body instanceof Uint8Array) {
      assert(
        body.length >= 29 && body.length <= ARCHIVE_LIMITS.ciphertextChunkBytes,
        'invalid_ciphertext_size',
      );
      payload = body;
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      assert(
        utf8.encode(payload).length <= ARCHIVE_LIMITS.jsonBytes,
        'archive_request_too_large',
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await this.fetcher(this.url + path, {
        method,
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: binary ? 'application/octet-stream' : 'application/json',
          'Cache-Control': 'no-store',
          ...(payload === undefined
            ? {}
            : {
                'Content-Type':
                  payload instanceof Uint8Array
                    ? 'application/octet-stream'
                    : 'application/json',
              }),
        },
        ...(payload === undefined ? {} : { body: payload }),
      });
      if (!response.ok || response.redirected) {
        await response.body?.cancel();
        throw new ArchiveError('archive_request_failed', response.status);
      }
      if (response.status === 204) return undefined;
      const bytes = await boundedBytes(
        response,
        binary ? ARCHIVE_LIMITS.ciphertextChunkBytes : ARCHIVE_LIMITS.jsonBytes,
      );
      if (binary) return bytes;
      try {
        return JSON.parse(textDecoder.decode(bytes));
      } catch {
        throw new ArchiveError('invalid_archive_response');
      }
    } catch (error) {
      if (error instanceof ArchiveError) throw error;
      throw new ArchiveError(
        controller.signal.aborted
          ? 'archive_request_timeout'
          : 'archive_transport_failed',
      );
    } finally {
      clearTimeout(timer);
    }
  }
  private scope(value: unknown): void {
    const scope = record(value);
    binding(scope.organizationId);
    assert(
      scope.projectId === this.projectId &&
        scope.applicationId === this.applicationId,
      'archive_scope_mismatch',
    );
  }
  async capabilities(): Promise<ArchiveCapabilities> {
    const result = record(await this.request('GET', '/capabilities'));
    assert(
      result.version === ARCHIVE_VERSION &&
        result.receiptFormatVersion === 'af.private-archive-receipt.v1' &&
        typeof result.available === 'boolean' &&
        result.permanent === true &&
        result.keys === 'application-owned' &&
        result.recovery === 'application-attested' &&
        result.providerEvidenceRequired === true,
      'unsupported_archive_response',
    );
    this.scope(result.scope);
    record(result.limits);
    return result as unknown as ArchiveCapabilities;
  }
  async create(archiveId: string, spec: ArchiveSpec): Promise<unknown> {
    return this.request('PUT', this.path(archiveId), validateSpec(spec));
  }
  async putObject(
    archiveId: string,
    objectId: string,
    ciphertext: Uint8Array,
  ): Promise<unknown> {
    opaque(objectId);
    return this.request(
      'PUT',
      `${this.path(archiveId)}/objects/${objectId}`,
      ciphertext,
    );
  }
  async getObject(archiveId: string, objectId: string): Promise<Uint8Array> {
    opaque(objectId);
    return (await this.request(
      'GET',
      `${this.path(archiveId)}/objects/${objectId}`,
      undefined,
      true,
    )) as Uint8Array;
  }
  async commit(archiveId: string): Promise<unknown> {
    return this.request('POST', `${this.path(archiveId)}/commit`, {});
  }
  private async page(
    archiveId: string,
    cursor: number | undefined,
    receipts: boolean,
  ): Promise<ArchiveStatus> {
    assert(
      cursor === undefined ||
        (Number.isSafeInteger(cursor) &&
          cursor >= 0 &&
          cursor <= ARCHIVE_LIMITS.objects),
      'invalid_archive_cursor',
    );
    const path =
      this.path(archiveId) +
      (receipts ? '/receipts' : '') +
      (cursor === undefined ? '' : `?cursor=${cursor}`);
    const result = record(await this.request('GET', path));
    assert(
      result.version === ARCHIVE_VERSION &&
        result.archiveId === archiveId &&
        result.receiptFormatVersion === 'af.private-archive-receipt.v1',
      'unsupported_archive_response',
    );
    this.scope(result.scope);
    opaque(result.revision);
    digest(result.inventoryDigest);
    assert(
      Array.isArray(result.objects) &&
        result.objects.length <= ARCHIVE_LIMITS.objects,
      'invalid_archive_response',
    );
    assert(
      result.objects.length <= 20 &&
        Number.isSafeInteger(result.objectCount) &&
        Number(result.objectCount) >= result.objects.length &&
        Number(result.objectCount) <= ARCHIVE_LIMITS.objects,
      'invalid_archive_page',
    );
    assert(
      result.nextCursor === null ||
        (Number.isSafeInteger(result.nextCursor) &&
          Number(result.nextCursor) === (cursor ?? 0) + result.objects.length &&
          Number(result.nextCursor) > (cursor ?? 0) &&
          Number(result.nextCursor) < Number(result.objectCount)),
      'invalid_archive_page',
    );
    if (result.nextCursor === null)
      assert(
        (cursor ?? 0) + result.objects.length === result.objectCount,
        'incomplete_archive_page',
      );
    for (const item of result.objects) {
      const object = record(item);
      opaque(object.id);
      digest(object.sha256);
      assert(
        Number.isSafeInteger(object.size) &&
          Number(object.size) >= 29 &&
          Number(object.size) <= ARCHIVE_LIMITS.ciphertextChunkBytes,
        'invalid_archive_response',
      );
    }
    return result as unknown as ArchiveStatus;
  }
  async status(archiveId: string, cursor?: number): Promise<ArchiveStatus> {
    return this.page(archiveId, cursor, false);
  }
  async receipts(archiveId: string, cursor?: number): Promise<ArchiveStatus> {
    return this.page(archiveId, cursor, true);
  }
  /** Page exact receipts without accumulating the whole catalog in memory. */
  async *iterateReceipts(
    archiveId: string,
  ): AsyncGenerator<ArchiveStatus['objects'][number]> {
    let cursor: number | undefined;
    let expectedDigest: string | undefined;
    let expectedCount: number | undefined;
    const seen = new Set<string>();
    do {
      const page = await this.receipts(archiveId, cursor);
      expectedDigest ??= page.inventoryDigest;
      expectedCount ??= page.objectCount;
      assert(
        page.inventoryDigest === expectedDigest &&
          page.objectCount === expectedCount,
        'archive_inventory_changed',
      );
      for (const object of page.objects) {
        assert(!seen.has(object.id), 'duplicate_archive_object');
        seen.add(object.id);
        yield object;
      }
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    } while (seen.size <= ARCHIVE_LIMITS.objects);
    assert(seen.size === expectedCount, 'incomplete_archive_inventory');
  }
  async recovery(archiveId: string, report: RecoveryReport): Promise<unknown> {
    const r = record(report);
    exact(r, [
      'version',
      'inventoryDigest',
      'objectIds',
      'manifestVerified',
      'contentVerified',
      'structureVerified',
      'playbackVerified',
      'evidenceDigest',
      'validatorVersion',
    ]);
    digest(report.inventoryDigest);
    digest(report.evidenceDigest);
    assert(
      report.version === ARCHIVE_VERSION &&
        report.manifestVerified === true &&
        report.contentVerified === true &&
        report.structureVerified === true &&
        report.playbackVerified === true &&
        typeof report.validatorVersion === 'string' &&
        /^[A-Za-z0-9._-]{1,80}$/.test(report.validatorVersion),
      'incomplete_recovery',
    );
    assert(
      Array.isArray(report.objectIds) &&
        report.objectIds.length >= 2 &&
        report.objectIds.length <= ARCHIVE_LIMITS.objects &&
        new Set(report.objectIds).size === report.objectIds.length,
      'incomplete_recovery',
    );
    for (const id of report.objectIds) opaque(id);
    return this.request('POST', `${this.path(archiveId)}/recovery`, report);
  }
  async cancel(archiveId: string): Promise<unknown> {
    return this.request('POST', `${this.path(archiveId)}/cancel`, {});
  }
  async reconcile(
    archiveId: string,
    request: ArchiveReconciliation,
  ): Promise<unknown> {
    const r = record(request);
    if ('retryConfirmation' in r) {
      exact(r, ['retryConfirmation']);
      assert(r.retryConfirmation === true, 'invalid_reconciliation');
    } else if ('resume' in r) {
      exact(r, ['resume']);
      assert(r.resume === true, 'invalid_reconciliation');
    } else if ('fundingReceipt' in r) {
      exact(r, ['fundingReceipt']);
      record(r.fundingReceipt);
    } else {
      exact(r, ['objectId', 'receipt']);
      opaque(r.objectId);
      record(r.receipt);
    }
    return this.request('POST', `${this.path(archiveId)}/reconcile`, request);
  }
}
