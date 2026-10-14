import { describe, expect, it, vi } from 'vitest';
import { assert, sha256, utf8 } from './contracts';
import { decryptObject, encryptObject, importArchiveKey } from './crypto';
import {
  deliverArchiveChunk,
  inventoryDigest,
  prepareArchive,
  recoverArchive,
} from './index';
import type { ArchiveManifest, PreparedArchive } from './types';

const scope = {
  organizationId: 'test-org',
  projectId: 'test-project',
  applicationId: 'test-app',
};
async function fixture() {
  let key = new Uint8Array();
  const objects = new Map<string, Uint8Array>();
  const prepared = await prepareArchive({
    executionContext: 'operator',
    scope,
    sourceExpiresAt: null,
    maxWinc: '0',
    files: [
      {
        path: 'item.txt',
        kind: 'attachment',
        mediaType: 'text/plain',
        source: new Blob(['secret-fixture-content']),
      },
    ],
    storeKey: async (bytes) => {
      key = bytes.slice();
    },
    writeCiphertext: async (id, bytes) => {
      objects.set(id, bytes.slice());
    },
  });
  return { prepared, key, objects };
}
async function mutateManifest(
  value: Awaited<ReturnType<typeof fixture>>,
  mutate: (manifest: ArchiveManifest) => void,
) {
  const { prepared, key, objects } = value;
  const id = prepared.spec.manifestObjectId;
  const encrypted = objects.get(id);
  assert(encrypted, 'fixture_missing');
  const cryptoKey = await importArchiveKey(key);
  const context = {
    scope,
    archiveId: prepared.archiveId,
    revision: prepared.spec.revision,
    objectId: id,
  };
  const raw = await decryptObject(cryptoKey, encrypted, context);
  const manifest = JSON.parse(new TextDecoder().decode(raw)) as ArchiveManifest;
  raw.fill(0);
  mutate(manifest);
  const bytes = utf8.encode(JSON.stringify(manifest));
  const cipher = await encryptObject(cryptoKey, bytes, context);
  prepared.manifestSha256 = sha256(bytes);
  bytes.fill(0);
  const object = prepared.spec.objects.find((o) => o.id === id);
  assert(object, 'fixture_missing');
  object.size = cipher.length;
  object.sha256 = sha256(cipher);
  objects.set(id, cipher);
  prepared.inventoryDigest = inventoryDigest(
    scope,
    prepared.archiveId,
    prepared.spec,
  );
}
function recover(value: Awaited<ReturnType<typeof fixture>>) {
  return recoverArchive({
    executionContext: 'operator',
    prepared: value.prepared,
    key: value.key,
    trustedManifestSha256: value.prepared.manifestSha256,
    readCiphertext: async (id) => {
      const bytes = value.objects.get(id);
      assert(bytes, 'fixture_missing');
      return bytes;
    },
    writePlaintext: async () => {},
  });
}
describe('authenticated-but-invalid source manifests', () => {
  it('rejects inventory omission, duplicate paths, contextual substitution and wrong source hash', async () => {
    const mutations: {
      mutate: (manifest: ArchiveManifest) => void;
      error: string;
    }[] = [
      {
        mutate: (manifest) => {
          manifest.files = [];
        },
        error: 'invalid_manifest_files',
      },
      {
        mutate: (manifest) => {
          const file = manifest.files[0];
          assert(file, 'fixture_missing');
          file.chunks = [];
          file.size = 0;
          file.sha256 = sha256(new Uint8Array());
        },
        error: 'incomplete_manifest_inventory',
      },
      {
        mutate: (manifest) => {
          const file = manifest.files[0];
          assert(file, 'fixture_missing');
          manifest.files.push(file);
        },
        error: 'duplicate_file_path',
      },
      {
        mutate: (manifest) => {
          manifest.scope.applicationId = 'other';
        },
        error: 'manifest_context_mismatch',
      },
      {
        mutate: (manifest) => {
          const file = manifest.files[0];
          assert(file, 'fixture_missing');
          file.sha256 = '0'.repeat(64);
        },
        error: 'file_integrity_failed',
      },
    ];
    for (const mutation of mutations) {
      const value = await fixture();
      await mutateManifest(value, mutation.mutate);
      await expect(recover(value)).rejects.toThrow(mutation.error);
    }
  });
  it('authenticates GCM even if an attacker updates the public ciphertext hash', async () => {
    const value = await fixture();
    const id = value.prepared.spec.manifestObjectId;
    const bytes = value.objects.get(id);
    assert(bytes, 'fixture_missing');
    bytes[12] = (bytes[12] ?? 0) ^ 1;
    const object = value.prepared.spec.objects.find((o) => o.id === id);
    assert(object, 'fixture_missing');
    object.sha256 = sha256(bytes);
    value.prepared.inventoryDigest = inventoryDigest(
      scope,
      value.prepared.archiveId,
      value.prepared.spec,
    );
    await expect(recover(value)).rejects.toThrow(
      'archive_authentication_failed',
    );
  });
  it('never quotes protected malformed JSON in its error message', async () => {
    let key = new Uint8Array();
    const objects = new Map<string, Uint8Array>();
    const prepared = await prepareArchive({
      executionContext: 'operator',
      scope,
      sourceExpiresAt: null,
      maxWinc: '0',
      files: [
        {
          path: 'chat.json',
          kind: 'chat',
          mediaType: 'application/json',
          source: new Blob(['private-content-canary']),
        },
      ],
      storeKey: async (raw) => {
        key = raw.slice();
      },
      writeCiphertext: async (id, bytes) => {
        objects.set(id, bytes.slice());
      },
    });
    await expect(recover({ prepared, key, objects })).rejects.toThrow(
      'invalid_private_json',
    );
    try {
      await recover({ prepared, key, objects });
    } catch (error) {
      expect(String(error)).not.toContain('private-content-canary');
    }
  });
});

describe('delivery scope and finite lease', () => {
  it('binds every AAD component and never calls release after contextual substitution', async () => {
    const value = await fixture();
    const object = value.prepared.spec.objects.find(
      (o) => o.id !== value.prepared.spec.manifestObjectId,
    );
    assert(object, 'fixture_missing');
    const ciphertext = value.objects.get(object.id);
    assert(ciphertext, 'fixture_missing');
    const base = {
      scope,
      archiveId: value.prepared.archiveId,
      revision: value.prepared.spec.revision,
      objectId: object.id,
    };
    const contexts = [
      { ...base, scope: { ...scope, organizationId: 'other' } },
      { ...base, scope: { ...scope, projectId: 'other' } },
      { ...base, scope: { ...scope, applicationId: 'other' } },
      { ...base, archiveId: crypto.randomUUID() },
      { ...base, revision: crypto.randomUUID() },
      { ...base, objectId: crypto.randomUUID() },
    ];
    const release = vi.fn(async () => {});
    for (const context of contexts)
      await expect(
        deliverArchiveChunk({
          executionContext: 'trusted-backend',
          key: value.key,
          ciphertext,
          context,
          authorize: async () => ({
            allowed: true,
            expiresAt: Date.now() + 1000,
          }),
          release,
        }),
      ).rejects.toThrow('archive_authentication_failed');
    expect(release).not.toHaveBeenCalled();
  });
  it('aborts an in-flight release at the lease deadline and erases plaintext', async () => {
    const value = await fixture();
    const object = value.prepared.spec.objects.find(
      (o) => o.id !== value.prepared.spec.manifestObjectId,
    );
    assert(object, 'fixture_missing');
    const ciphertext = value.objects.get(object.id);
    assert(ciphertext, 'fixture_missing');
    let borrowed: Uint8Array | undefined;
    let releaseSignal: AbortSignal | undefined;
    await expect(
      deliverArchiveChunk({
        executionContext: 'trusted-backend',
        key: value.key,
        ciphertext,
        context: {
          scope,
          archiveId: value.prepared.archiveId,
          revision: value.prepared.spec.revision,
          objectId: object.id,
        },
        authorize: async () => ({ allowed: true, expiresAt: Date.now() + 100 }),
        release: async (bytes, lease) => {
          borrowed = bytes;
          releaseSignal = lease.signal;
          await new Promise<void>((resolve) =>
            lease.signal.addEventListener('abort', () => resolve(), {
              once: true,
            }),
          );
        },
      }),
    ).rejects.toThrow('archive_delivery_expired');
    expect(releaseSignal?.aborted).toBe(true);
    expect(borrowed?.every((byte) => byte === 0)).toBe(true);
  });
});
