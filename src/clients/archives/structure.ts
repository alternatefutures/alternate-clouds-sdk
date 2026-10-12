import { assert, parsePrivateJson, record, safePath } from './contracts';
import type { ArchiveManifestFile } from './types';

function localReference(from: string, reference: string): string {
  assert(
    reference.length > 0 &&
      !/[\\:%?#{}]/.test(reference) &&
      ![...reference].some(
        (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127,
      ) &&
      !reference.startsWith('/'),
    'unsafe_hls_reference',
  );
  const parts = from.split('/').slice(0, -1);
  for (const part of reference.split('/')) {
    if (part === '..') {
      assert(parts.length > 0, 'unsafe_hls_reference');
      parts.pop();
    } else if (part !== '.') {
      assert(part !== '', 'unsafe_hls_reference');
      parts.push(part);
    }
  }
  const path = parts.join('/');
  safePath(path);
  return path;
}
export function validateHls(
  file: ArchiveManifestFile,
  text: string,
  files: Map<string, ArchiveManifestFile>,
): void {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  assert(lines[0] === '#EXTM3U', 'invalid_hls');
  let references = 0;
  let pending: 'segment' | 'playlist' | undefined;
  for (const line of lines.slice(1)) {
    assert(
      !line.startsWith('#EXT-X-KEY:') &&
        !line.startsWith('#EXT-X-SESSION-KEY:') &&
        !line.startsWith('#EXT-X-CONTENT-STEERING:') &&
        !line.startsWith('#EXT-X-DEFINE:'),
      'unsupported_hls_encryption_or_steering',
    );
    const refs: string[] = [];
    if (!line.startsWith('#')) {
      assert(pending, 'unexpected_hls_uri');
      const referenced = files.get(localReference(file.path, line));
      if (pending === 'playlist')
        assert(referenced?.kind === 'hls', 'invalid_hls_variant');
      refs.push(line);
      pending = undefined;
    } else {
      const uriAttributes = [...line.matchAll(/(?:^|[:,])([A-Z0-9-]*URI)=/g)];
      const quotedUris = [
        ...line.matchAll(/(?:^|[:,])([A-Z0-9-]*URI)="([^"]+)"(?=,|$)/g),
      ];
      assert(uriAttributes.length === quotedUris.length, 'invalid_hls_uri');
      for (const match of quotedUris) refs.push(match[2] ?? '');
      if (line.startsWith('#EXTINF:')) {
        assert(!pending, 'missing_hls_uri');
        pending = 'segment';
        assert(
          /^#EXTINF:(?:[0-9]+(?:\.[0-9]+)?),/.test(line),
          'invalid_hls_duration',
        );
      }
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        assert(!pending, 'missing_hls_uri');
        pending = 'playlist';
      }
    }
    for (const ref of refs) {
      const path = localReference(file.path, ref);
      const referenced = files.get(path);
      assert(
        referenced && path !== file.path && referenced.size > 0,
        'missing_hls_object',
      );
      references++;
    }
  }
  assert(!pending, 'missing_hls_uri');
  assert(references > 0, 'empty_hls');
  if (lines.some((line) => line.startsWith('#EXTINF:')))
    assert(lines.includes('#EXT-X-ENDLIST'), 'incomplete_hls');
}
function timestamp(value: string): number {
  const match = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(value);
  assert(match, 'invalid_caption_timestamp');
  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1000
  );
}
export function validateCaption(text: string): void {
  assert(/^\uFEFF?WEBVTT(?:[ \t].*)?(?:\r?\n|$)/.test(text), 'invalid_caption');
  const cues = text.split(/\r?\n/).filter((line) => line.includes('-->'));
  assert(cues.length > 0, 'empty_caption');
  for (const cue of cues) {
    const match = /^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(cue);
    assert(
      match && timestamp(match[2] ?? '') > timestamp(match[1] ?? ''),
      'invalid_caption_cue',
    );
  }
}
export function validateTranscript(text: string): void {
  const json: unknown = parsePrivateJson(text);
  const segments = Array.isArray(json) ? json : record(json).segments;
  assert(Array.isArray(segments) && segments.length > 0, 'invalid_transcript');
  for (const item of segments) {
    const segment = record(item);
    assert(
      typeof segment.text === 'string' &&
        typeof segment.start === 'number' &&
        Number.isFinite(segment.start) &&
        segment.start >= 0 &&
        typeof segment.end === 'number' &&
        Number.isFinite(segment.end) &&
        segment.end >= segment.start,
      'invalid_transcript_segment',
    );
  }
}
export function validateChat(text: string, mediaType: string): void {
  const json: unknown =
    mediaType === 'application/x-ndjson'
      ? text
          .trim()
          .split(/\r?\n/)
          .map((line) => parsePrivateJson(line))
      : parsePrivateJson(text);
  const messages = Array.isArray(json) ? json : record(json).messages;
  assert(Array.isArray(messages), 'invalid_chat');
  const ids = new Set<string>();
  for (const item of messages) {
    const message = record(item);
    assert(
      typeof message.id === 'string' &&
        message.id.length > 0 &&
        !ids.has(message.id) &&
        typeof message.text === 'string' &&
        typeof message.timestamp === 'string' &&
        Number.isFinite(Date.parse(message.timestamp)),
      'invalid_chat_message',
    );
    ids.add(message.id);
  }
}
