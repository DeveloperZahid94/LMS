import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Express } from 'express';
import { AppModule } from './app.module';

/** Build a fully-initialised Express app wrapping the Nest application. */
async function createExpressApp(): Promise<Express> {
  const expressApp = express();
  // Raise the body limit — student photos / ID scans arrive as base64 data URLs.
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
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? '*').split(','),
    credentials: true,
  });
  await app.init();
  return expressApp;
}

// ---- Serverless entry (Vercel) ----
// An Express app IS a Node (req, res) handler, and Vercel hands the function
// Node req/res — so we pass them straight through (no serverless-http, which is
// for AWS Lambda's event/context shape). The app is cached across warm
// invocations. Built by webpack (nx build api), which compiles Nest correctly —
// unlike @vercel/node's esbuild, which deadlocks bootstrapping Nest.
let cachedApp: Express | null = null;

export default async function handler(req: any, res: any) {
  if (!cachedApp) {
    cachedApp = await createExpressApp();
  }
  return cachedApp(req, res);
}

// ---- Local dev entry ----
// Bind a port locally; on Vercel (process.env.VERCEL set) we only export the
// handler. (`require.main === module` is unreliable inside a webpack bundle.)
if (!process.env.VERCEL) {
  void (async () => {
    const expressApp = await createExpressApp();
    const port = Number(process.env.PORT ?? 3000);
    expressApp.listen(port, () =>
      Logger.log(`LMS API ready on http://localhost:${port}/${process.env.API_PREFIX ?? 'api'}`, 'Bootstrap'),
    );
  })();
}
