import { assert, executionContext, objectAad } from './contracts';
import { decryptObject, importArchiveKey } from './crypto';
import type { ArchiveDeliveryGrant, DeliverArchiveChunkOptions } from './types';

async function freshGrant(
  options: DeliverArchiveChunkOptions,
): Promise<ArchiveDeliveryGrant> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const grant = await Promise.race([
      options.authorize(options.context),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('archive_authorization_timeout')),
          5000,
        );
      }),
    ]);
    assert(
      grant?.allowed === true &&
        Number.isFinite(grant.expiresAt) &&
        grant.expiresAt > Date.now() &&
        grant.expiresAt <= start + 5000 &&
        Date.now() - start < 5000,
      'archive_delivery_denied',
    );
    return grant;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
/** Backend-only one-chunk delivery. The application must enforce the supplied abort
 * signal/deadline at its actual no-store HTTP transport; bytes already received persist. */
export async function deliverArchiveChunk(
  options: DeliverArchiveChunkOptions,
): Promise<void> {
  executionContext(options.executionContext);
  objectAad(options.context);
  const first = await freshGrant(options);
  const key = await importArchiveKey(options.key);
  const plaintext = await decryptObject(
    key,
    options.ciphertext,
    options.context,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    const second = await freshGrant(options);
    const expiresAt = Math.min(first.expiresAt, second.expiresAt);
    assert(expiresAt > Date.now(), 'archive_delivery_expired');
    await Promise.race([
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('archive_delivery_expired'));
        }, expiresAt - Date.now());
      }),
      options.release(plaintext, {
        expiresAt,
        cacheControl: 'no-store',
        signal: controller.signal,
      }),
    ]);
    assert(Date.now() < expiresAt, 'archive_delivery_expired');
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
    plaintext.fill(0);
  }
}
