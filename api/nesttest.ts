// Minimal NestJS app (one inline controller, NO AppModule / modules / Prisma).
// - returns {ok:true} → Nest + serverless-http boot fine on Vercel; the hang is
//   a specific module/provider in our AppModule (bisect from there).
// - hangs (504) → Nest bootstrap itself stalls in this environment.
import 'reflect-metadata';
import { Module, Controller, Get } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Express } from 'express';
import serverless from 'serverless-http';

@Controller()
class DiagController {
  @Get('nesttest')
  ok() {
    return { ok: true, build: 'nesttest-1', commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown' };
  }
}

@Module({ controllers: [DiagController] })
class DiagModule {}

let cached: ReturnType<typeof serverless> | null = null;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

async function build() {
  const { NestFactory } = await import('@nestjs/core');
  const expressApp: Express = express();
  const app = await NestFactory.create(DiagModule, new ExpressAdapter(expressApp), { logger: ['error', 'warn'] });
  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api');
  await app.init();
  return serverless(expressApp);
}

export default async function handler(req: any, res: any) {
  try {
    if (!cached) cached = await withTimeout(build(), 20000, 'minimal nest');
    return cached(req, res);
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: err?.message ?? String(err), build: 'nesttest-1' }));
    return;
  }
}
