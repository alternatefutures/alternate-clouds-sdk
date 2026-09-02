#!/usr/bin/env node
/**
 * Packaged-artifact smoke test.
 *
 * The unit suite runs against `src`, so it cannot catch defects that only exist
 * in the published artifact: a dependency that drops its `require` condition, a
 * transitive package that ships without a compiled `dist`, a missing exports
 * entry. Both issue #19 and issue #20 shipped past a green test run for exactly
 * that reason.
 *
 * This packs the package as npm would publish it, installs the tarball into a
 * throwaway project, and imports every published entrypoint through both ESM
 * and CJS. Run it in CI after `build`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

/** Entrypoints declared in package.json `exports`, and how each must load. */
const CHECKS = [
  { specifier: '@alternatefutures/sdk', named: ['AlternateFuturesSdk'], esm: true },
  { specifier: '@alternatefutures/sdk/browser', named: ['AlternateFuturesSdk'], esm: true },
  {
    specifier: '@alternatefutures/sdk/node',
    named: ['AlternateFuturesSdk', 'PersonalAccessTokenService'],
    esm: true,
    cjs: true,
  },
];

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const workdir = mkdtempSync(join(tmpdir(), 'af-sdk-verify-'));
let failures = 0;

try {
  console.log('· packing');
  run('pnpm', ['pack', '--pack-destination', workdir], repoRoot);

  const tarball = readdirSync(workdir).find((f) => f.endsWith('.tgz'));
  if (!tarball) throw new Error('pnpm pack produced no tarball');

  const project = join(workdir, 'consumer');
  run('mkdir', ['-p', project]);
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'consumer', version: '1.0.0' }));

  console.log(`· installing ${tarball} into a clean project`);
  run('npm', ['install', '--no-audit', '--no-fund', join(workdir, tarball)], project);

  for (const { specifier, named, esm, cjs } of CHECKS) {
    if (esm) {
      const src = `import {${named.join(',')}} from '${specifier}';
        for (const [k, v] of Object.entries({${named.join(',')}})) {
          if (typeof v !== 'function') { console.error('not a function: ' + k); process.exit(1); }
        }`;
      try {
        run('node', ['--input-type=module', '-e', src], project);
        console.log(`  PASS  esm  ${specifier}`);
      } catch (err) {
        failures++;
        console.error(`  FAIL  esm  ${specifier}\n${err.stderr || err.message}`);
      }
    }

    if (cjs) {
      const src = `const m = require('${specifier}');
        for (const k of ${JSON.stringify(named)}) {
          if (typeof m[k] !== 'function') { console.error('not a function: ' + k); process.exit(1); }
        }`;
      try {
        run('node', ['-e', src], project);
        console.log(`  PASS  cjs  ${specifier}`);
      } catch (err) {
        failures++;
        console.error(`  FAIL  cjs  ${specifier}\n${err.stderr || err.message}`);
      }
    }
  }
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} entrypoint check(s) failed.`);
  process.exit(1);
}
console.log('\nAll published entrypoints load from a clean install.');
