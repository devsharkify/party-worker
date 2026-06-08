import "reflect-metadata";
import "dotenv/config";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import fastifyCookie from "@fastify/cookie";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";

async function bootstrap() {
  const env = loadEnv();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
  );

  // Baseline security headers on every response. Hand-rolled (no helmet dep).
  const isProd = env.NODE_ENV === "production";
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook("onSend", (_req, reply, payload, done) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-DNS-Prefetch-Control", "off");
    if (isProd) {
      reply.header(
        "Strict-Transport-Security",
        "max-age=15552000; includeSubDomains",
      );
    }
    done(null, payload);
  });

  await app.register(fastifyCookie as any);
  await app.register(fastifyMultipart as any, {
    limits: { fileSize: 100 * 1024 * 1024 },
  });

  // Serve dev media (local StorageProvider) at /media/*
  const storageDir = join(process.cwd(), env.STORAGE_LOCAL_DIR);
  mkdirSync(storageDir, { recursive: true });
  await app.register(fastifyStatic as any, {
    root: storageDir,
    prefix: "/media/",
    decorateReply: false,
  });

  app.enableCors({
    origin: [env.WEB_APP_URL, env.ADMIN_URL, /localhost:\d+$/],
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("myTRS API")
    .setDescription("Creator-factory backend: auth, content, personalization, reach, scoring.")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  // eslint-disable-next-line no-console
  console.log(`[api] ready on ${env.API_BASE_URL} — OpenAPI at ${env.API_BASE_URL}/docs`);
}

void bootstrap();
