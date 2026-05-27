/* eslint-disable no-process-env */

export type Defined = {
  SDK__AUTH_APPS_URL?: string;
  SDK__AUTH_SERVICE_URL?: string;
  SDK__IPFS__STORAGE_API_URL?: string;
  SDK__GRAPHQL_API_URL?: string;
  SDK__UPLOAD_PROXY_API_URL?: string;
};

// These ENVs will be hardcoded during build. Do not use parseEnv function from @alternatefutures/env-guards
// IMPORTANT: Use only public values, no token secrets and stuff like that
// IMPORTANT: Those values will be visible in public source code pushed to NPM
export const defined: Defined = {
  SDK__AUTH_APPS_URL: process.env['SDK__AUTH_APPS_URL'] as string,
  SDK__AUTH_SERVICE_URL: process.env['SDK__AUTH_SERVICE_URL'] as string,
  SDK__IPFS__STORAGE_API_URL: process.env['SDK__IPFS__STORAGE_API_URL'] as string,
  SDK__GRAPHQL_API_URL: process.env['SDK__GRAPHQL_API_URL'] as string,
  SDK__UPLOAD_PROXY_API_URL: process.env['SDK__UPLOAD_PROXY_API_URL'] as string,
};

// The variables are parsed at build time, in order to ensure
// that the override is intentional we should stick
// with the application prefix to avoid unexpected behaviour for
// polluted environments that might have similar env vars
// e.g. AF__UI_APP_URL
const override_env_var_prefix = '';

export const getDefined = (key: keyof typeof defined): string => {
  const value =
    (typeof process !== 'undefined' &&
      process?.env?.[`${override_env_var_prefix}${key}`]) ||
    defined[key];

  if (value === undefined || value === null) {
    throw new Error(
      `Expected key "${key}" to be defined but got ${typeof value}`,
    );
  }

  if (typeof value !== 'string') {
    throw new Error(
      `Expected key "${key}" to be string but got ${typeof value}`,
    );
  }

  return value;
};
