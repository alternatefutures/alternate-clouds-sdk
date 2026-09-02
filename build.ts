import { build, BuildOptions } from 'esbuild';

import pkgJson from './package.json';
import type { Defined } from './src/defined';
import { defined } from './src/defined';
import { mockNodeNative } from './src/plugins/mockNodeNative';
import { replaceDynamicImportPlugin } from './src/plugins/replaceDynamicImportPlugin';
import { parseEnvVarsAsKeyVal } from './src/utils/env';

type BuildHandlerArgs = Pick<BuildOptions, "bundle" | "platform" | "target" | "outfile" | "format" | "sourcemap" | "external" | "inject" | "plugins" | "entryPoints" | "minify" | "define" | "alias" | "splitting" | "outdir">;

const define = parseEnvVarsAsKeyVal<Defined>({ defined });

// Internal @alternatefutures/* packages are published without a compiled `dist`
// (they ship TypeScript sources but declare `main: ./dist/index.js`), so leaving
// them external emits a bare require() that cannot resolve at runtime. Bundle
// them from source instead. See issue #20.
const INTERNAL_SCOPE = '@alternatefutures/';

const external = Object.keys(pkgJson.dependencies).filter(
  (dep) => !dep.startsWith(INTERNAL_SCOPE),
);

const requiredBuilds: BuildHandlerArgs[] = [
  {
    external,
    entryPoints: ['src/index.ts'],
    platform: 'node',
    format: 'cjs',
    define: {
      ...define,
      'IS_NODE': '"true"',
    },
    bundle: true,
    minify: true,
    outdir: './dist/node',
    sourcemap: true,
    plugins: [
      replaceDynamicImportPlugin,
    ],
  },
  {
    external,
    entryPoints: ['src/index.ts'],
    platform: 'browser',
    format: 'esm',
    target: 'es2020',
    define: {
      ...define,
    },
    bundle: true,
    minify: true,
    outdir: './dist/browser',
    sourcemap: true,
    plugins: [
      replaceDynamicImportPlugin,
      mockNodeNative,
    ],
    splitting: true,
  },
];

const buildHandler = async ({
  bundle,
  external,
  format,
  outfile,
  platform,
  sourcemap,
  target,
  inject,
  plugins,
  entryPoints,
  minify,
  define,
  alias,
  splitting,
  outdir,
}: BuildHandlerArgs) => {
  const buildOptions: BuildOptions = {
    bundle,
    define,
    external,
    format,
    outfile,
    platform,
    sourcemap,
    target,
    inject,
    plugins,
    entryPoints,
    minify,
    alias,
    splitting,
    outdir,
  };

  try {
    await build(buildOptions);
  } catch (error) {
    console.error(`👹 Oops! Failed to bundle for platform ${platform} for some reason...`);
    console.error(error);
    process.exit(1);
  }
}

const main = async () => {
  for (const args of requiredBuilds) {
    await buildHandler(args);
  }
};

main();
