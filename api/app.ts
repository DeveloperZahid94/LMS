// Vercel serverless function for the NestJS API. Routed here via the
// /api/(.*) -> /api/serverless rewrite in vercel.json.
//
// IMPORTANT: NestFactory + AppModule are imported DYNAMICALLY inside
// buildHandler() so the whole app graph loads *within* the bootstrap timeout. A
// static top-level import evaluates the app before the handler runs, so a
// load/init hang escapes the timeout and surfaces as an opaque 504 with no logs.
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Express } from 'express';
import serverless from 'serverless-http';

const BUILD = 'app-fresh-1';

let cachedHandler: ReturnType<typeof serverless> | null = null;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function buildHandler() {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../apps/api/src/app.module');

  const expressApp: Express = express();
  expressApp.use(express.json({ limit: '15mb' }));
  expressApp.use(express.urlencoded({ extended: true, limit: '15mb' }));

  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    logger: ['error', 'warn'],
    bodyParser: false,
  });
  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.enableCors({ origin: (process.env.CORS_ORIGIN ?? '*').split(','), credentials: true });

  await app.init();
  return serverless(expressApp);
}

export default async function handler(req: any, res: any) {
  try {
    if (!cachedHandler) {
      cachedHandler = await withTimeout(buildHandler(), 22000, 'Nest bootstrap');
    }
    return cachedHandler(req, res);
  } catch (err: any) {
    cachedHandler = null;
    const detail = err?.message ?? String(err);
    // eslint-disable-next-line no-console
    console.error('[API bootstrap/handler error]', detail, err?.stack);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'API bootstrap failed', detail, build: BUILD }));
    return;
  }
}
