import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // Disable the default body parser so we can raise the limit — student photos and
  // ID scans are sent as base64 data URLs which exceed the 100kb default.
  const app = await NestFactory.create(AppModule, { cors: true, bodyParser: false });
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ extended: true, limit: '15mb' }));

  const prefix = process.env.API_PREFIX ?? 'api';
  app.setGlobalPrefix(prefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:4200').split(','),
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('LMS Platform API')
    .setDescription('Multi-tenant Library & Study Cabin Management API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${prefix}/docs`, app, doc);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`LMS API ready on http://localhost:${port}/${prefix}`, 'Bootstrap');
}

if (require.main === module) {
  bootstrap();
}
