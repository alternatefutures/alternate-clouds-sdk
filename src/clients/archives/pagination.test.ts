import { expect, it, vi } from 'vitest';
import { ARCHIVE_VERSION, ArchiveClient } from './index';

it('paginates exact receipts with fresh requests and rejects incomplete/repeated inventory', async () => {
  const archiveId = crypto.randomUUID();
  const scope = {
    organizationId: 'org',
    projectId: 'project',
    applicationId: 'app',
  };
  const base = {
    version: ARCHIVE_VERSION,
    receiptFormatVersion: 'af.private-archive-receipt.v1',
    archiveId,
    scope,
    revision: crypto.randomUUID(),
    inventoryDigest: 'a'.repeat(64),
    objectCount: 2,
  };
  const objects = [0, 1].map(() => ({
    id: crypto.randomUUID(),
    size: 29,
    sha256: 'b'.repeat(64),
    state: 'CONFIRMED',
    receipt: { fixture: true },
    transactionId: 'synthetic',
    confirmedAt: '2026-01-01T00:00:00Z',
  }));
  const getAccessToken = vi.fn(async () => 'token');
  const fetch = vi.fn(async (url: string | URL | Request) => {
    const cursor = new URL(String(url)).searchParams.get('cursor');
    return Response.json({
      ...base,
      nextCursor: cursor === null ? 1 : null,
      objects: [objects[cursor === null ? 0 : 1]],
    });
  });
  const client = new ArchiveClient({
    apiUrl: 'https://api.test',
    projectId: scope.projectId,
    applicationId: scope.applicationId,
    accessTokenService: { getAccessToken },
    fetch,
  });
  const result = [];
  for await (const object of client.iterateReceipts(archiveId))
    result.push(object);
  expect(result).toEqual(objects);
  expect(getAccessToken).toHaveBeenCalledTimes(2);
  expect(String(fetch.mock.calls[1]?.[0])).toContain('/receipts?cursor=1');
  await expect(client.status(archiveId, -1)).rejects.toThrow(
    'invalid_archive_cursor',
  );
  fetch.mockImplementation(async () =>
    Response.json({ ...base, nextCursor: null, objects: [objects[0]] }),
  );
  await expect(client.receipts(archiveId)).rejects.toThrow(
    'incomplete_archive_page',
  );
  fetch.mockImplementation(async (url) =>
    Response.json({
      ...base,
      nextCursor: new URL(String(url)).searchParams.has('cursor') ? null : 1,
      objects: [objects[0]],
    }),
  );
  await expect(
    (async () => {
      for await (const _object of client.iterateReceipts(archiveId)) {
        /* fully consume */
      }
    })(),
  ).rejects.toThrow('duplicate_archive_object');
});
