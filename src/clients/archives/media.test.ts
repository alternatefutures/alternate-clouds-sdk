/** Local decoder exercise only: synthetic data, no provider/network/permanent upload. */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { prepareArchive, recoverArchive } from './index';
import type { ArchiveFileSource } from './types';

let decoderAvailable = false;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
  decoderAvailable = true;
} catch {
  /* Explicitly skipped on hosts without a decoder. */
}

describe.skipIf(!decoderAvailable)(
  'real local synthetic HLS/original recovery and seeking',
  () => {
    it('reconstructs every original/HLS/caption/transcript/chat object and decodes first/middle/last frames', async () => {
      const input = await mkdtemp(join(tmpdir(), 'af-archive-input-'));
      const output = await mkdtemp(join(tmpdir(), 'af-archive-output-'));
      try {
        execFileSync('ffmpeg', [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc=size=64x64:rate=10',
          '-t',
          '6',
          '-c:v',
          'libx264',
          '-threads',
          '1',
          '-pix_fmt',
          'yuv420p',
          '-g',
          '10',
          join(input, 'original.mp4'),
        ]);
        execFileSync('ffmpeg', [
          '-v',
          'error',
          '-i',
          join(input, 'original.mp4'),
          '-c',
          'copy',
          '-hls_time',
          '2',
          '-hls_playlist_type',
          'vod',
          '-hls_segment_filename',
          join(input, 'segment-%03d.ts'),
          join(input, 'playlist.m3u8'),
        ]);
        await writeFile(
          join(input, 'captions.vtt'),
          'WEBVTT\n\n00:00.000 --> 00:06.000\nSynthetic decoder fixture\n',
        );
        await writeFile(
          join(input, 'transcript.json'),
          JSON.stringify([{ start: 0, end: 6, text: 'Synthetic transcript' }]),
        );
        await writeFile(
          join(input, 'chat.json'),
          JSON.stringify([
            {
              id: 'fixture-message',
              timestamp: '2026-01-01T00:00:00Z',
              text: 'Synthetic chat',
            },
          ]),
        );
        const files: ArchiveFileSource[] = [];
        for (const path of (await readdir(input)).sort()) {
          const kind = path.endsWith('.m3u8')
            ? 'hls'
            : path.endsWith('.vtt')
              ? 'caption'
              : path === 'transcript.json'
                ? 'transcript'
                : path === 'chat.json'
                  ? 'chat'
                  : 'media';
          const mediaType =
            kind === 'hls'
              ? 'application/vnd.apple.mpegurl'
              : kind === 'caption'
                ? 'text/vtt'
                : kind === 'media'
                  ? path.endsWith('.mp4')
                    ? 'video/mp4'
                    : 'video/mp2t'
                  : 'application/json';
          files.push({
            path,
            kind,
            mediaType,
            source: new Blob([await readFile(join(input, path))]),
          });
        }
        let key = new Uint8Array();
        const objects = new Map<string, Uint8Array>();
        const prepared = await prepareArchive({
          executionContext: 'operator',
          scope: {
            organizationId: 'fixture-org',
            projectId: 'fixture-project',
            applicationId: 'fixture-app',
          },
          sourceExpiresAt: null,
          maxWinc: '0',
          files,
          storeKey: async (raw) => {
            key = raw.slice();
          },
          writeCiphertext: async (id, bytes) => {
            objects.set(id, bytes.slice());
          },
        });
        const report = await recoverArchive({
          executionContext: 'operator',
          prepared,
          key,
          trustedManifestSha256: prepared.manifestSha256,
          readCiphertext: async (id) => objects.get(id) ?? new Uint8Array(),
          writePlaintext: async (file, bytes, index) => {
            await writeFile(join(output, file.path), bytes, {
              flag: index === 0 ? 'wx' : 'a',
              mode: 0o600,
            });
          },
          validatePlayback: async ({ manifest }) => {
            const paths = manifest.files
              .filter((file) => file.kind === 'media' || file.kind === 'hls')
              .map((file) => file.path);
            const observations: {
              path: string;
              seconds: number;
              decodedRgbBytes: number;
            }[] = [];
            for (const path of paths) {
              const duration = Number(
                execFileSync(
                  'ffprobe',
                  [
                    '-v',
                    'error',
                    '-protocol_whitelist',
                    'file,pipe',
                    '-show_entries',
                    'format=duration',
                    '-of',
                    'default=noprint_wrappers=1:nokey=1',
                    join(output, path),
                  ],
                  { encoding: 'utf8' },
                ).trim(),
              );
              expect(Number.isFinite(duration) && duration > 0).toBe(true);
              for (const seconds of [
                0,
                duration / 2,
                Math.max(0, duration - 0.5),
              ]) {
                const frame = execFileSync('ffmpeg', [
                  '-v',
                  'error',
                  '-protocol_whitelist',
                  'file,pipe',
                  '-i',
                  join(output, path),
                  '-ss',
                  String(seconds),
                  '-frames:v',
                  '1',
                  '-f',
                  'rawvideo',
                  '-pix_fmt',
                  'rgb24',
                  'pipe:1',
                ]);
                expect(frame.length, `${path}@${seconds}`).toBe(64 * 64 * 3);
                observations.push({
                  path,
                  seconds,
                  decodedRgbBytes: frame.length,
                });
              }
            }
            return {
              validatorVersion: 'ffmpeg-decoder-fixture.v1',
              evidence: { observations },
              validatedPaths: paths,
              seekChecks: paths.map((path) => ({
                path,
                first: true,
                middle: true,
                last: true,
              })),
            };
          },
        });
        expect(report.objectIds).toHaveLength(objects.size);
        expect(report.playbackVerified).toBe(true);
        for (const file of files)
          expect(await readFile(join(output, file.path))).toEqual(
            await readFile(join(input, file.path)),
          );
      } finally {
        await rm(input, { recursive: true, force: true });
        await rm(output, { recursive: true, force: true });
      }
    }, 30_000);
  },
);
