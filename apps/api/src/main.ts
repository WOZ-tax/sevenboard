import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import * as cookieParser from 'cookie-parser';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './filters/http-exception.filter';
import { CsrfGuard } from './auth/csrf.guard';
import { initSentry } from './common/sentry';

// Sentry must be initialized before NestFactory.create
initSentry();

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  app.use(cookieParser());
  app.use(json({ limit: '1mb' }));

  // forbidNonWhitelisted を入れると DTO 型のメタデータが runtime に正しく
  // 読まれないケース（compile 出力や Cloud Run 環境による）で whitelist 内の
  // property も forbidden 扱いになる事故が起きるため、stripping のみ行う。
  // - whitelist=true: DTO クラスに無いプロパティは silently 削除（型安全は維持）
  // - forbidNonWhitelisted を外すことで「property X should not exist」を出さない
  // - transform=true: plain object を DTO instance に変換して @Type() 等を反映
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.useGlobalGuards(new CsrfGuard());
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger / OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SevenBoard API')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('sb_token')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`SevenBoard API running on http://localhost:${port}`);
  console.log(`Swagger UI available at http://localhost:${port}/api-docs`);
  // 資格情報の prefix も本番ログに載せない（有/無のみ）
  console.log(`MF token loaded: ${process.env.MF_ACCESS_TOKEN ? 'yes' : 'no'}`);
}
bootstrap();
