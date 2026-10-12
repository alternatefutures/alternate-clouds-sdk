import { createHash, webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  ARCHIVE_LIMITS,
  ARCHIVE_VERSION,
  ArchiveClient,
  deliverArchiveChunk,
  inventoryDigest,
  objectAad,
  prepareArchive,
  recoverArchive,
  validatePreparedArchive,
} from './index';
import type {
  ArchiveFileSource,
  PreparedArchive,
  RecoverArchiveOptions,
} from './types';

if (!globalThis.crypto) vi.stubGlobal('crypto', webcrypto);
const scope = {
  organizationId: 'org-fixture',
  projectId: 'project-fixture',
  applicationId: 'app-fixture',
};
const encoder = new TextEncoder();
const hash = (value: Uint8Array | string) =>
  createHash('sha256').update(value).digest('hex');
const source = (
  path: string,
  text: string,
  kind: ArchiveFileSource['kind'] = 'attachment',
  mediaType = 'text/plain',
): ArchiveFileSource => ({ path, kind, mediaType, source: new Blob([text]) });
async function prepare(
  files = [source('private-canary.txt', 'private plaintext canary')],
) {
  const objects = new Map<string, Uint8Array>();
  let key = new Uint8Array();
  const prepared = await prepareArchive({
    executionContext: 'operator',
    scope,
    sourceExpiresAt: null,
    maxWinc: '123',
    files,
    storeKey: async (raw) => {
      key = raw.slice();
    },
    writeCiphertext: async (id, bytes) => {
      objects.set(id, bytes.slice());
    },
  });
  return { prepared, key, objects };
}
function recovery(
  fixture: Awaited<ReturnType<typeof prepare>>,
  extra: Partial<RecoverArchiveOptions> = {},
) {
  const output = new Map<string, Uint8Array[]>();
  return {
    output,
    options: {
      executionContext: 'operator' as const,
      prepared: fixture.prepared,
      key: fixture.key,
      trustedManifestSha256: fixture.prepared.manifestSha256,
      readCiphertext: async (id: string) => {
        const object = fixture.objects.get(id);
        if (!object) throw new Error('missing');
        return object;
      },
      writePlaintext: async (file, bytes) => {
        output.set(file.path, [
          ...(output.get(file.path) ?? []),
          bytes.slice(),
        ]);
      },
      ...extra,
    } satisfies RecoverArchiveOptions,
  };
}
async function mockPlayback({
  manifest,
}: Parameters<NonNullable<RecoverArchiveOptions['validatePlayback']>>[0]) {
  const paths = manifest.files
    .filter((f) => f.kind === 'hls' || f.kind === 'media')
    .map((f) => f.path);
  return {
    validatorVersion: 'mock-contract-only.v1',
    evidence: { fixture: 'explicitly mocked player' },
    validatedPaths: paths,
    seekChecks: paths.map((path) => ({
      path,
      first: true as const,
      middle: true as const,
      last: true as const,
    })),
  };
}

describe('private archive supported encryptor and recovery', () => {
  it('rejects older Node runtimes before generating keys or writing ciphertext', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      process.versions,
      'node',
    );
    if (!descriptor) throw new Error('node_version_descriptor_missing');
    try {
      Object.defineProperty(process.versions, 'node', {
        ...descriptor,
        value: '18.18.2',
      });
      await expect(prepare()).rejects.toThrow('archive_node_20_17_required');
    } finally {
      Object.defineProperty(process.versions, 'node', descriptor);
    }
  });

  it.each([
    'audio/mpegurl',
    'audio/x-mpegurl',
    'application/vnd.apple.mpegurl',
  ])(
    'prepares and recovers HLS playlists with %s aliases',
    async (mediaType) => {
      const fixture = await prepare([
        source(
          'playlist.m3u8',
          '#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nsegment.ts\n#EXT-X-ENDLIST\n',
          'hls',
          mediaType,
        ),
        source('segment.ts', 'synthetic segment', 'media', 'video/mp2t'),
      ]);
      const { options, output } = recovery(fixture, {
        validatePlayback: mockPlayback,
      });
      const report = await recoverArchive(options);
      expect(report.playbackVerified).toBe(true);
      expect(output.has('playlist.m3u8')).toBe(true);
      expect(output.has('segment.ts')).toBe(true);
    },
  );

  it('matches API canonical AAD and digest with sorted inventory; exposes no key or file metadata', async () => {
    const { prepared, key, objects } = await prepare();
    expect(key.length).toBe(32);
    const { spec } = prepared;
    const expected = hash(
      JSON.stringify([
        ARCHIVE_VERSION,
        scope.organizationId,
        scope.projectId,
        scope.applicationId,
        prepared.archiveId,
        spec.revision,
        spec.manifestObjectId,
        null,
        '123',
        spec.objects.map((o) => [o.id, o.size, o.sha256]),
      ]),
    );
    expect(prepared.inventoryDigest).toBe(expected);
    expect(
      inventoryDigest(scope, prepared.archiveId, {
        ...spec,
        objects: [...spec.objects].reverse(),
      }),
    ).toBe(expected);
    const context = {
      scope,
      archiveId: prepared.archiveId,
      revision: spec.revision,
      objectId: spec.objects[0]?.id,
    };
    expect(new TextDecoder().decode(objectAad(context))).toBe(
      JSON.stringify([
        ARCHIVE_VERSION,
        scope.organizationId,
        scope.projectId,
        scope.applicationId,
        prepared.archiveId,
        spec.revision,
        context.objectId,
      ]),
    );
    const serialized = JSON.stringify(spec);
    expect(serialized).not.toContain('canary');
    expect(serialized).not.toContain('manifestSha256');
    expect(serialized).not.toContain(Buffer.from(key).toString('hex'));
    for (const bytes of objects.values())
      expect(new TextDecoder().decode(bytes)).not.toContain(
        'private plaintext canary',
      );
    expect(validatePreparedArchive(prepared)).toEqual(prepared);
  });
  it('rejects file/directory collisions during preparation in either order but preserves distinct prefixes', async () => {
    for (const paths of [
      ['a', 'a/b'],
      ['a/b', 'a'],
      ['a-c', 'a/b', 'a'],
      ['a', 'a-c', 'a/b'],
    ]) {
      await expect(
        prepare(paths.map((path) => source(path, 'x'))),
      ).rejects.toThrow('file_directory_collision');
    }
    const fixture = await prepare([source('a', 'one'), source('ab/c', 'two')]);
    const recovered = recovery(fixture);
    await recoverArchive(recovered.options);
    expect([...recovered.output.keys()].sort()).toEqual(['a', 'ab/c']);
  });
  it('recovers all authenticated files, hashes and lengths and erases callback plaintext buffers', async () => {
    const fixture = await prepare([
      source(
        'chat.json',
        JSON.stringify([
          { id: 'm1', text: 'hello', timestamp: '2026-01-01T00:00:00Z' },
        ]),
        'chat',
        'application/json',
      ),
      source(
        'captions.vtt',
        'WEBVTT\n\n00:00.000 --> 00:01.000\nHello\n',
        'caption',
        'text/vtt',
      ),
      source(
        'transcript.json',
        JSON.stringify([{ start: 0, end: 1, text: 'hello' }]),
        'transcript',
        'application/json',
      ),
      source('empty.txt', ''),
    ]);
    const { options, output } = recovery(fixture);
    let borrowed: Uint8Array | undefined;
    const write = options.writePlaintext;
    options.writePlaintext = async (file, bytes, index) => {
      borrowed = bytes;
      await write(file, bytes, index);
    };
    const report = await recoverArchive(options);
    expect(report.objectIds.sort()).toEqual(
      fixture.prepared.spec.objects.map((o) => o.id).sort(),
    );
    expect(
      report.contentVerified &&
        report.manifestVerified &&
        report.structureVerified,
    ).toBe(true);
    expect(output.size).toBe(4);
    expect(borrowed?.every((b) => b === 0)).toBe(true);
  });
  it('requires durable key custody before producing any object and erases its temporary key', async () => {
    const sink = vi.fn();
    let borrowed: Uint8Array | undefined;
    await expect(
      prepareArchive({
        executionContext: 'operator',
        scope,
        sourceExpiresAt: null,
        maxWinc: '1',
        files: [source('x', 'x')],
        storeKey: async (raw) => {
          borrowed = raw;
          throw new Error('custody offline');
        },
        writeCiphertext: sink,
      }),
    ).rejects.toThrow('custody offline');
    expect(sink).not.toHaveBeenCalled();
    expect(borrowed?.every((b) => b === 0)).toBe(true);
  });
  it('rejects wrong key, wrong AAD scope, untrusted manifest, ciphertext corruption/truncation/missing object', async () => {
    const fixture = await prepare();
    await expect(
      recoverArchive(
        recovery(fixture, { key: crypto.getRandomValues(new Uint8Array(32)) })
          .options,
      ),
    ).rejects.toThrow('archive_authentication_failed');
    const changed = structuredClone(fixture.prepared);
    changed.scope.applicationId = 'another-app';
    changed.inventoryDigest = inventoryDigest(
      changed.scope,
      changed.archiveId,
      changed.spec,
    );
    await expect(
      recoverArchive(recovery(fixture, { prepared: changed }).options),
    ).rejects.toThrow('archive_authentication_failed');
    await expect(
      recoverArchive(
        recovery(fixture, { trustedManifestSha256: '0'.repeat(64) }).options,
      ),
    ).rejects.toThrow('trusted_manifest_mismatch');
    const id = fixture.prepared.spec.objects.find(
      (o) => o.id !== fixture.prepared.spec.manifestObjectId,
    )?.id;
    const original = fixture.objects.get(id) ?? new Uint8Array();
    const corrupted = original.slice();
    corrupted[12] ^= 1;
    fixture.objects.set(id, corrupted);
    await expect(recoverArchive(recovery(fixture).options)).rejects.toThrow(
      'ciphertext_integrity_failed',
    );
    fixture.objects.set(id, original.slice(0, -1));
    await expect(recoverArchive(recovery(fixture).options)).rejects.toThrow(
      'ciphertext_integrity_failed',
    );
    fixture.objects.delete(id);
    await expect(recoverArchive(recovery(fixture).options)).rejects.toThrow(
      'missing',
    );
  });
  it('rejects authenticated but incomplete HLS bundles and external URI attributes', async () => {
    for (const playlist of [
      '#EXTM3U\n#EXTINF:1,\nmissing.ts\n#EXT-X-ENDLIST\n',
      '#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,URI="https://evil.test/sub.vtt"\n',
      '#EXTM3U\n#EXT-X-MAP:URI="../../escape"\n',
      '#EXTM3U\n#EXT-X-MAP:URI=segment.ts\n',
      '#EXTM3U\n#EXTINF:1,\nsegment.ts\n',
    ]) {
      const fixture = await prepare([
        source('master.m3u8', playlist, 'hls', 'application/vnd.apple.mpegurl'),
        source('segment.ts', 'synthetic media', 'media', 'video/mp2t'),
      ]);
      await expect(
        recoverArchive(
          recovery(fixture, { validatePlayback: mockPlayback }).options,
        ),
      ).rejects.toThrow();
    }
  });
  it('refuses RECOVERED without actual caller playback and complete first/middle/last evidence', async () => {
    const fixture = await prepare([
      source(
        'master.m3u8',
        '#EXTM3U\n#EXTINF:1,\nsegment.ts\n#EXT-X-ENDLIST\n',
        'hls',
        'application/vnd.apple.mpegurl',
      ),
      source('segment.ts', 'synthetic', 'media', 'video/mp2t'),
    ]);
    await expect(recoverArchive(recovery(fixture).options)).rejects.toThrow(
      'playback_validator_required',
    );
    await expect(
      recoverArchive(
        recovery(fixture, {
          validatePlayback: async () => ({
            validatorVersion: 'test',
            evidence: { test: true },
            validatedPaths: [],
            seekChecks: [],
          }),
        }).options,
      ),
    ).rejects.toThrow('incomplete_playback_evidence');
    expect(
      (
        await recoverArchive(
          recovery(fixture, { validatePlayback: mockPlayback }).options,
        )
      ).playbackVerified,
    ).toBe(true);
  });
  it('refuses malformed chat, caption and transcript content', async () => {
    for (const file of [
      source(
        'chat.json',
        '{"messages":[{"id":"x","text":"x","timestamp":"invalid"}]}',
        'chat',
        'application/json',
      ),
      source(
        'caption.vtt',
        'WEBVTT\n\n00:02.000 --> 00:01.000\nwrong\n',
        'caption',
        'text/vtt',
      ),
      source(
        'transcript.json',
        '[{"start":2,"end":1,"text":"x"}]',
        'transcript',
        'application/json',
      ),
    ]) {
      await expect(
        recoverArchive(recovery(await prepare([file])).options),
      ).rejects.toThrow();
    }
  });
  it('streams across large file boundaries with bounded ciphertext and recovers exact bytes', async () => {
    const chunk = new Uint8Array(ARCHIVE_LIMITS.plaintextChunkBytes);
    chunk.fill(67);
    const fixture = await prepare([
      {
        path: 'large.bin',
        kind: 'attachment',
        mediaType: 'application/octet-stream',
        source: (async function* () {
          yield chunk;
          yield chunk;
          yield new Uint8Array([1, 2, 3]);
        })(),
      },
    ]);
    expect(fixture.objects.size).toBe(4);
    expect(
      Math.max(...[...fixture.objects.values()].map((o) => o.length)),
    ).toBe(ARCHIVE_LIMITS.ciphertextChunkBytes);
    const recovered = recovery(fixture);
    await recoverArchive(recovered.options);
    expect(
      recovered.output.get('large.bin')?.map((bytes) => bytes.length),
    ).toEqual([chunk.length, chunk.length, 3]);
  });
  it('enforces source chunk bound, inventory bound, traversal and sensitive unexpected fields', async () => {
    await expect(
      prepare([
        {
          path: 'large',
          kind: 'attachment',
          mediaType: 'application/octet-stream',
          source: (async function* () {
            yield new Uint8Array(ARCHIVE_LIMITS.plaintextChunkBytes + 1);
          })(),
        },
      ]),
    ).rejects.toThrow('source_chunk_too_large');
    await expect(prepare([source('../secret', 'x')])).rejects.toThrow(
      'invalid_file_path',
    );
    const fixture = await prepare();
    const prepared = structuredClone(fixture.prepared);
    prepared.spec.objects = Array.from(
      { length: ARCHIVE_LIMITS.objects + 1 },
      () => prepared.spec.objects[0],
    );
    expect(() => validatePreparedArchive(prepared)).toThrow(
      'invalid_inventory',
    );
    expect(() =>
      validatePreparedArchive({ ...fixture.prepared, key: 'secret' }),
    ).toThrow('unexpected_fields');
    expect(() =>
      validatePreparedArchive({
        ...fixture.prepared,
        spec: { ...fixture.prepared.spec, filename: 'metadata-canary' },
      }),
    ).toThrow('unexpected_fields');
  });
});

describe('backend delivery authorization cutoff', () => {
  async function delivery() {
    const fixture = await prepare();
    const id = fixture.prepared.spec.objects.find(
      (o) => o.id !== fixture.prepared.spec.manifestObjectId,
    )?.id;
    return {
      executionContext: 'trusted-backend' as const,
      key: fixture.key,
      ciphertext: fixture.objects.get(id) ?? new Uint8Array(),
      context: {
        scope,
        archiveId: fixture.prepared.archiveId,
        revision: fixture.prepared.spec.revision,
        objectId: id,
      },
    };
  }
  it('reauthorizes each chunk before and after decryption, never caches grants or exposes keys', async () => {
    const base = await delivery();
    const authorize = vi.fn(async () => ({
      allowed: true,
      expiresAt: Date.now() + 4000,
    }));
    const release = vi.fn(async (bytes, lease) => {
      expect(new TextDecoder().decode(bytes)).toBe('private plaintext canary');
      expect(lease.cacheControl).toBe('no-store');
      expect(lease.signal.aborted).toBe(false);
    });
    await deliverArchiveChunk({ ...base, authorize, release });
    await deliverArchiveChunk({ ...base, authorize, release });
    expect(authorize).toHaveBeenCalledTimes(4);
    expect(release).toHaveBeenCalledTimes(2);
  });
  it('denies revoked, expired or overlong grants without releasing plaintext', async () => {
    const base = await delivery();
    const release = vi.fn();
    const authorize = vi
      .fn()
      .mockResolvedValueOnce({ allowed: true, expiresAt: Date.now() + 4000 })
      .mockResolvedValueOnce({ allowed: false, expiresAt: Date.now() + 4000 });
    await expect(
      deliverArchiveChunk({ ...base, authorize, release }),
    ).rejects.toThrow('archive_delivery_denied');
    for (const expiresAt of [Date.now() - 1, Date.now() + 20_000])
      await expect(
        deliverArchiveChunk({
          ...base,
          authorize: async () => ({ allowed: true, expiresAt }),
          release,
        }),
      ).rejects.toThrow('archive_delivery_denied');
    expect(release).not.toHaveBeenCalled();
  });
});

describe('bounded authenticated archive HTTP client', () => {
  const client = (
    fetch: typeof globalThis.fetch,
    apiUrl = 'https://api.test',
  ) =>
    new ArchiveClient({
      apiUrl,
      projectId: scope.projectId,
      applicationId: scope.applicationId,
      accessTokenService: { getAccessToken: async () => 'test-token' },
      fetch,
    });
  it('admits the complete 4096-object inventory and protected descriptor within the JSON bound', async () => {
    const fixture = await prepare();
    const prepared = structuredClone(fixture.prepared);
    prepared.spec.objects = Array.from(
      { length: ARCHIVE_LIMITS.objects },
      (_, i) => ({
        id: `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`,
        size:
          i === 0
            ? ARCHIVE_LIMITS.manifestBytes
            : ARCHIVE_LIMITS.ciphertextChunkBytes,
        sha256: 'f'.repeat(64),
      }),
    );
    prepared.spec.manifestObjectId = '00000000-0000-4000-8000-000000000000';
    prepared.spec.maxWinc = '9'.repeat(30);
    prepared.spec.sourceExpiresAt = '+275760-09-13T00:00:00.000Z';
    prepared.scope = {
      organizationId: 'o'.repeat(128),
      projectId: 'p'.repeat(128),
      applicationId: 'a'.repeat(128),
    };
    prepared.inventoryDigest = inventoryDigest(
      prepared.scope,
      prepared.archiveId,
      prepared.spec,
    );
    const bytes = encoder.encode(JSON.stringify(prepared)).length;
    expect(bytes).toBeGreaterThan(512 * 1024);
    expect(bytes).toBeLessThan(ARCHIVE_LIMITS.jsonBytes);
    expect(validatePreparedArchive(prepared)).toEqual(prepared);
    const fetch = vi.fn(async (_url, init) => {
      expect(encoder.encode(String(init.body)).length).toBeLessThan(
        ARCHIVE_LIMITS.jsonBytes,
      );
      expect(JSON.parse(String(init.body)).objects).toHaveLength(4096);
      return new Response('{}');
    });
    await client(fetch).create(prepared.archiveId, prepared.spec);
    expect(fetch).toHaveBeenCalledTimes(1);
    prepared.spec.objects.push({
      id: '00000000-0000-4000-8000-ffffffffffff',
      size: 29,
      sha256: 'f'.repeat(64),
    });
    await expect(
      client(fetch).create(prepared.archiveId, prepared.spec),
    ).rejects.toThrow('invalid_inventory');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects an encrypted manifest beyond its separate four MiB bound before sending', async () => {
    const { prepared } = await prepare();
    const manifest = prepared.spec.objects.find(
      (o) => o.id === prepared.spec.manifestObjectId,
    );
    if (!manifest) throw new Error('fixture_missing');
    manifest.size = ARCHIVE_LIMITS.manifestBytes + 1;
    const fetch = vi.fn();
    await expect(
      client(fetch).create(prepared.archiveId, prepared.spec),
    ).rejects.toThrow('manifest_too_large');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses exact routes, a fresh existing bearer token, no redirects/cache, ciphertext only and no automatic retries', async () => {
    const fixture = await prepare();
    const requests: { url: string; init: RequestInit }[] = [];
    const fetch = vi.fn(async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response('{}', {
        headers: { 'content-type': 'application/json' },
      });
    });
    const sdk = client(fetch);
    await sdk.create(fixture.prepared.archiveId, fixture.prepared.spec);
    const entry = [...fixture.objects][0];
    if (!entry) throw new Error('fixture_missing');
    const [id, bytes] = entry;
    await sdk.putObject(fixture.prepared.archiveId, id, bytes);
    await sdk.commit(fixture.prepared.archiveId);
    await sdk.cancel(fixture.prepared.archiveId);
    await sdk.reconcile(fixture.prepared.archiveId, {
      retryConfirmation: true,
    });
    await sdk.reconcile(fixture.prepared.archiveId, { resume: true });
    await sdk.reconcile(fixture.prepared.archiveId, {
      fundingReceipt: { id: 'synthetic-recovered-receipt' },
    });
    await expect(
      sdk.reconcile(fixture.prepared.archiveId, {
        resume: true,
        retryConfirmation: true,
      } as never),
    ).rejects.toThrow();
    expect(requests[0]?.url).toBe(
      `https://api.test/v1/archives/projects/${scope.projectId}/applications/${scope.applicationId}/${fixture.prepared.archiveId}`,
    );
    for (const { init } of requests) {
      expect(init.redirect).toBe('error');
      expect(init.cache).toBe('no-store');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer test-token',
      );
      expect(JSON.stringify(init)).not.toContain('private-canary.txt');
    }
    expect(requests[1]?.init.body).toBe(bytes);
    const failure = vi.fn(
      async () => new Response('private error canary', { status: 403 }),
    );
    await expect(
      client(failure).commit(fixture.prepared.archiveId),
    ).rejects.toThrow('archive_request_failed');
    expect(failure).toHaveBeenCalledTimes(1);
  });
  it('requires HTTPS except explicitly enabled loopback and rejects credentials/path/query', () => {
    const fetch = vi.fn();
    for (const url of [
      'http://api.test',
      'http://localhost',
      'https://secret@api.test',
      'https://api.test/path',
      'https://api.test/?token=secret',
    ])
      expect(() => client(fetch, url)).toThrow();
    expect(
      () =>
        new ArchiveClient({
          apiUrl: 'http://127.0.0.1:8080',
          allowInsecureLoopback: true,
          projectId: scope.projectId,
          applicationId: scope.applicationId,
          accessTokenService: { getAccessToken: async () => 'x' },
          fetch,
        }),
    ).not.toThrow();
  });
  it('rejects streamed and declared oversized responses, redirect results, and cross-scope responses', async () => {
    const id = crypto.randomUUID();
    await expect(
      client(
        vi.fn(
          async () =>
            new Response('{}', {
              headers: {
                'content-length': String(ARCHIVE_LIMITS.jsonBytes + 1),
              },
            }),
        ),
      ).status(id),
    ).rejects.toThrow('archive_response_too_large');
    await expect(
      client(
        vi.fn(
          async () =>
            new Response(
              new Uint8Array(ARCHIVE_LIMITS.ciphertextChunkBytes + 1),
            ),
        ),
      ).getObject(id, crypto.randomUUID()),
    ).rejects.toThrow('archive_response_too_large');
    const response = new Response('{}');
    Object.defineProperty(response, 'redirected', { value: true });
    await expect(
      client(vi.fn(async () => response)).commit(id),
    ).rejects.toThrow('archive_request_failed');
    const fixture = await prepare();
    const status = {
      version: ARCHIVE_VERSION,
      receiptFormatVersion: 'af.private-archive-receipt.v1',
      archiveId: fixture.prepared.archiveId,
      scope: { ...scope, applicationId: 'another' },
      revision: fixture.prepared.spec.revision,
      inventoryDigest: fixture.prepared.inventoryDigest,
      objects: [],
    };
    await expect(
      client(vi.fn(async () => Response.json(status))).status(
        fixture.prepared.archiveId,
      ),
    ).rejects.toThrow('archive_scope_mismatch');
  });
});
