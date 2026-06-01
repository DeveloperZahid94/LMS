// Vercel serverless entrypoint.
// Bootstraps the Nest app once per warm container and reuses it across invocations.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Express } from 'express';
import serverless from 'serverless-http';
import { AppModule } from '../src/app.module';

let cachedHandler: ReturnType<typeof serverless> | null = null;

async function buildHandler() {
  const expressApp: Express = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), {
    logger: ['error', 'warn'],
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
  if (!cachedHandler) {
    cachedHandler = await buildHandler();
  }
  return cachedHandler(req, res);
}
