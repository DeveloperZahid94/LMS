// Vercel auto-detects serverless functions inside the repo-root `api/` directory.
// This file is a thin proxy that delegates to the NestJS handler in apps/api.
// The actual handler caches a bootstrapped Nest app between invocations.
// build-marker: serverless-3 (bump to force a fresh @vercel/node function build)
export { default } from '../apps/api/api/index';
