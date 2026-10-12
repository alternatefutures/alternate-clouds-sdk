# Private archive SDK — implementation preview

The new key-bearing archive helpers require **Node.js 20.17 or later**, or WebCrypto in a trusted secure browser tool. They reject older Node runtimes before handling keys. Other existing SDK clients keep their package-level runtime support. Attendees must never receive archive keys.

The archive helpers prepare encrypted bundles, reconstruct complete archives, and support authorized delivery from a trusted application backend. Import them from `@alternatefutures/sdk/archives` in the version containing this change. This implementation is unreleased; it does not make permanent archive writes available. Clouds currently reports `available: false` because the provider credit-share control upload has no verified hard fee bound (`provider_control_cost_unverified`). No real-provider recovery or paid exercise is claimed.

Archive keys belong to the application or a privileged recovery operator. Never send a key, key-bearing bundle or decrypt-capable handle to an attendee/browser. A key holder can decrypt public ciphertext independently of SDK checks. Browser WebCrypto support is for trusted tooling, not an authorization boundary.

## Exports and API client

The subpath exports `ArchiveClient`, `ArchiveError`, `prepareArchive`, `recoverArchive`, `validatePreparedArchive`, `deliverArchiveChunk`, `inventoryDigest`, `objectAad`, `validateSpec`, `ARCHIVE_VERSION`, `ARCHIVE_LIMITS` and their public types. The root package also re-exports the archive surface.

```ts
import { ArchiveClient } from '@alternatefutures/sdk/archives';

const archives = new ArchiveClient({
  apiUrl: process.env.CLOUDS_API_ORIGIN!, // HTTPS origin; no /graphql path
  projectId: process.env.PROJECT_ID!,
  applicationId: process.env.APPLICATION_ID!,
  accessTokenService: {
    getAccessToken: async () => process.env.AF_TOKEN!,
  },
});

const capability = await archives.capabilities();
console.log({ available: capability.available, reason: capability.reason });
```

Use existing Clouds credentials and current project access; each archive operation also requires its distinct current application grant. The API derives organization from the project. `allowInsecureLoopback: true` permits only explicit HTTP loopback tests. Requests use no-store, reject redirects, have a 30-second deadline and never automatically retry a paid operation.

| Method | Result / input |
| --- | --- |
| `capabilities()` | Formats, availability, scope, numeric limits and blocker. |
| `create(archiveId, spec)` | Only the immutable `prepared.spec`, never the complete local descriptor. |
| `putObject(archiveId, objectId, ciphertext)` | One whole ciphertext object. |
| `commit(archiveId)` | Seal/queue the complete staged bundle under its immutable cap. |
| `status(archiveId, cursor?)`, `receipts(archiveId, cursor?)` | Full status page, including `objects`, `objectCount`, `nextCursor`; cursor is a nonnegative offset. |
| `iterateReceipts(archiveId)` | Async iterator over object entries across bounded pages. |
| `getObject(archiveId, objectId)` | Whole confirmed ciphertext; no direct byte ranges. |
| `recovery(archiveId, report)` | Submit complete application-attested recovery evidence. |
| `cancel(archiveId)` | Current cancellation permission is checked before mutation, then again for durable commit; uncertain commit stays denied/pending. |
| `reconcile(archiveId, request)` | Exactly one of `{ objectId, receipt }`, `{ fundingReceipt }`, `{ retryConfirmation: true }`, or `{ resume: true }`; never repeat a consumed submission. |

Inspect state and `nextCursor` rather than treating the first status page as the whole inventory. `ACCEPTED` is a receipt, `CONFIRMED` adds trusted gateway observations plus local ciphertext size/hash checks, and `RECOVERED` is application-attested reconstruction. None is a local chain proof. `UNKNOWN` requires operator evidence, not retrying upload with a new ID. V1 full-cap lifetime reservations never recycle on cancellation, expiry or apparent unused credits.

Funding receipt import records exact evidence for the known funding transaction/share; it does not resume work. Explicit `resume: true` may queue only unattempted objects after every attempted outcome is resolved, with the original signer/share/cap, live source/staging/grant, sufficient approved credits and fresh initiating-actor authority. It remains blocked by the provider write gate in this build. Receipt import, read-only confirmation retry and resume are mutually exclusive request shapes. The SDK does not obtain human spend/permanence consent for a caller; applications must establish that before requesting any future enabled resume.

Cancellation first obtains a read-only signed `cancel` intent, records local denial, then obtains a freshly authorized signed `cancel` commit. Both phases require current cancellation permission. Inspect-only permission cannot mutate an archive; uncertain commit remains `CANCEL_PENDING`. The public `cancel()` API sends no phase selector.

## Synthetic offline round trip

This Node example encrypts and verifies one synthetic attachment locally. It makes no network requests or permanent writes. It uses the real exported API and removes its temporary fixture at completion. For real use, retain keys and trusted manifest hashes in independent application custody according to existing policy; do not copy this temporary-fixture lifecycle into production retention.

```js
import { mkdtemp, mkdir, writeFile, readFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareArchive, recoverArchive } from '@alternatefutures/sdk/archives';

const directory = await mkdtemp(join(tmpdir(), 'archive-synthetic-'));
let key;
try {
  await mkdir(join(directory, 'objects'), { mode: 0o700 });
  await mkdir(join(directory, 'recovered'), { mode: 0o700 });
  const prepared = await prepareArchive({
    executionContext: 'operator',
    scope: { organizationId: 'org_fixture', projectId: 'project_fixture', applicationId: 'app_fixture' },
    sourceExpiresAt: null,
    maxWinc: '0',
    files: [{ path: 'fixture.txt', mediaType: 'text/plain', kind: 'attachment', source: new Blob(['Synthetic fixture\n']) }],
    storeKey: async (bytes) => {
      await writeFile(join(directory, 'key.bin'), bytes, { mode: 0o600, flag: 'wx' });
    },
    writeCiphertext: async (id, bytes) => {
      await writeFile(join(directory, 'objects', id), bytes, { mode: 0o600, flag: 'wx' });
    },
  });
  // Preserve this original commitment in trusted source custody in a real app.
  // It must not be learned from a downloaded manifest or sent to Clouds.
  const trustedManifestSha256 = prepared.manifestSha256;
  key = new Uint8Array(await readFile(join(directory, 'key.bin')));
  const report = await recoverArchive({
    executionContext: 'operator',
    prepared,
    key,
    trustedManifestSha256,
    readCiphertext: async (id) => new Uint8Array(await readFile(join(directory, 'objects', id))),
    writePlaintext: async (file, bytes, index) => {
      // This fixture has one known path. Production sinks must validate every path.
      if (file.path !== 'fixture.txt') throw new Error('Unexpected fixture path');
      const path = join(directory, 'recovered', 'fixture.txt');
      if (index === 0) await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
      else await appendFile(path, bytes);
    },
  });
  if (await readFile(join(directory, 'recovered', 'fixture.txt'), 'utf8') !== 'Synthetic fixture\n') {
    throw new Error('Fixture reconstruction failed');
  }
  console.log({ state: 'VERIFIED_LOCALLY', objects: report.objectIds.length });
} finally {
  key?.fill(0);
  await rm(directory, { recursive: true, force: true });
}
```

`prepareArchive` accepts explicit files with `Blob`, `AsyncIterable<Uint8Array>`, or a function returning that iterable. Input stream yields must each be at most 4 MiB. `storeKey` must durably consume the supplied bytes before returning: that callback's key buffer is erased afterward. `writeCiphertext` must durably consume each encrypted object before returning. Preserve the returned archive ID/revision/spec across retries; the scope and IDs are authenticated encryption context.

The returned `PreparedArchive` includes a plaintext manifest hash. Protect it as source metadata independently of untrusted downloads. Only send `prepared.spec` to `create`, and only ciphertext to `putObject`. `maxWinc` is an immutable integer decimal sponsor cap, not a USD estimate; zero does not establish a free provider control operation.

`recoverArchive` requires the independently trusted original manifest hash and every ciphertext object. It verifies GCM authentication, inventory equality and all plaintext lengths/hashes. Write plaintext only to private temporary storage until the whole operation succeeds; the callback must consume bytes before returning because buffers are erased. Empty files emit one empty chunk at index 0. Remove partial output after failure according to application policy.

## Media, captions, transcripts and chat

Recovery performs structure validation and requires a real `validatePlayback({ manifest, inventoryDigest })` callback for media/HLS files. It must exercise the actual decoder/player against reconstructed private files and return `ArchivePlaybackEvidence` with a version, a JSON evidence object, every validated media/HLS path, and successful first/middle/last seek checks for each. Do not return canned success flags. Missing validators, missing files, a broken reference or failed seek prevents a complete report. Bundles without media use the SDK's no-media validation result.

HLS requires a complete local VOD inventory and `ENDLIST`; remote/variable URIs, encrypted HLS `KEY`, content steering and external references are rejected. VTT is parsed. Transcript JSON accepts an array or `{ "segments": [...] }` with numeric `start`, `end`, and string `text`; chat accepts JSON arrays/`messages` or NDJSON entries with `id`, `text`, and parseable `timestamp`. Keep all actual source content inside encrypted manifests/chunks.

The complete report includes the inventory digest, every object ID, validation booleans, validator version and evidence digest. The application's authority must independently approve its exact digest against trusted source inventory before Clouds records `RECOVERED`. Local success does not prove cloud confirmation or current attendee permission.

## Trusted backend delivery

`deliverArchiveChunk({ executionContext: 'trusted-backend', context, key, ciphertext, authorize, release })` obtains fresh application authorization before and after decryption. `context` contains scope, archive ID, revision and object ID. `authorize` returns `{ allowed, expiresAt }`; the lease must expire within five seconds. `release(plaintext, { expiresAt, cacheControl: 'no-store', signal })` must apply no-store and enforce the abort signal/deadline in the actual transport. The SDK erases its buffer afterward, but cannot recall copied or received bytes.

Reauthorize every chunk, manifest and chat page. At most one 4 MiB plaintext chunk may be released per lease. Keep keys backend, terminate stale streams and verify real cache/CDN/player behavior. Generic SDK tests do not certify an application's attendee transport. Removal prevents future authorized access; it is not physical erasure of public ciphertext, retained keys, backups, exports or delivered plaintext.

## Limits and release evidence

`ARCHIVE_VERSION` is `af.private-archive.v1`. Limits are 4 MiB plaintext chunks, 4 MiB + 28 ciphertext objects, 4 MiB encrypted manifest (plaintext manifest ≤4 MiB − 28), 4,096 objects including manifest, total ciphertext ≤16 GiB + 4,096 × 28, and 1 MiB JSON. Structured HLS/VTT/transcript/chat validation is bounded to 4 MiB per file. API status/receipt pages are bounded; use the iterator rather than accumulating all receipt bodies for large bundles.

The local synthetic fixture tests include media reconstruction/seek validation, but no provider permanence, billing, live permission adapter or application delivery integration was exercised. Clouds #356 requires reviewed versioned releases and a separately authorized real-provider/recovery exercise. Olivier events #84 remains blocked. Keep source hot copies and existing retention unchanged.

## Local verification

The [SDK test workflow](../.github/workflows/test-runner.yml) explicitly installs FFmpeg and FFprobe before `pnpm test`. The media fixture exercises a local decoder and first/middle/last seeks; it must not silently substitute a stub when those tools are absent. In a checkout with dependencies and those binaries available, use:

```bash
ffmpeg -version
ffprobe -version
pnpm test
pnpm tsc
pnpm build
```

These are synthetic/local verification steps; they do not authorize permanent uploads or prove provider billing/confirmation or an application's attendee delivery integration.

At the 12 October 2026 working-tree verification snapshot, the archive-focused tests passed. See the final review evidence for exact counts and source identities. The broader SDK suite reported seven existing function-route failures; it was not fully green. Exact final commit/release validation remains separate.
