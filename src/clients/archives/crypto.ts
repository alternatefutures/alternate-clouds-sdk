import { assert, objectAad } from './contracts';
import { ARCHIVE_LIMITS, type ArchiveObjectContext } from './types';
export async function importArchiveKey(raw: Uint8Array): Promise<CryptoKey> {
  assert(
    raw instanceof Uint8Array && raw.byteLength === 32,
    'invalid_archive_key',
  );
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}
export async function encryptObject(
  key: CryptoKey,
  plaintext: Uint8Array,
  context: ArchiveObjectContext,
): Promise<Uint8Array> {
  assert(
    plaintext.length > 0 &&
      plaintext.length <= ARCHIVE_LIMITS.plaintextChunkBytes,
    'invalid_plaintext_size',
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        additionalData: objectAad(context),
        tagLength: 128,
      },
      key,
      plaintext,
    ),
  );
  const output = new Uint8Array(12 + encrypted.length);
  output.set(nonce);
  output.set(encrypted, 12);
  return output;
}
export async function decryptObject(
  key: CryptoKey,
  ciphertext: Uint8Array,
  context: ArchiveObjectContext,
): Promise<Uint8Array> {
  assert(
    ciphertext instanceof Uint8Array &&
      ciphertext.length >= 29 &&
      ciphertext.length <= ARCHIVE_LIMITS.ciphertextChunkBytes,
    'invalid_ciphertext_size',
  );
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: ciphertext.subarray(0, 12),
          additionalData: objectAad(context),
          tagLength: 128,
        },
        key,
        ciphertext.subarray(12),
      ),
    );
  } catch {
    throw new Error('archive_authentication_failed');
  }
}
