// Vercel serverless entrypoint.
// Bootstraps the Nest app once per warm container and reuses it across invocations.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Express } from 'express';
import serverless from 'serverless-http';
import { AppModule } from '../src/app.module';

// Bump this to force @vercel/node to rebuild the function (busts its build cache).
const BUILD = 'serverless-3';

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
  const expressApp: Express = express();
  // Raise body limit so base64 photo / ID-scan data URLs aren't rejected (default 100kb).
  expressApp.use(express.json({ limit: '15mb' }));
  expressApp.use(express.urlencoded({ extended: true, limit: '15mb' }));
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    logger: ['error', 'warn'],
    bodyParser: false,
  });

  const prefix = process.env.API_PREFIX ?? 'api';
  app.setGlobalPrefix(prefix);

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? '*').split(','),
    credentials: true,
  });

  await app.init();
  return serverless(expressApp);
}

export default async function handler(req: any, res: any) {
  try {
    if (!cachedHandler) {
      // Cap bootstrap so a hung init returns a readable 500 instead of a silent
      // FUNCTION_INVOCATION_TIMEOUT (504) with no logs.
      cachedHandler = await withTimeout(buildHandler(), 22000, 'Nest bootstrap');
    }
    return cachedHandler(req, res);
  } catch (err: any) {
    cachedHandler = null; // let the next invocation retry a fresh bootstrap
    const detail = err?.message ?? String(err);
    // eslint-disable-next-line no-console
    console.error('[API bootstrap/handler error]', detail, err?.stack);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'API bootstrap failed', detail, build: BUILD }));
    return;
  }
}
