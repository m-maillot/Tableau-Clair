import { buildApp } from './app';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await buildApp({ webDist: process.env.WEB_DIST }).listen({ port, host });
} catch (error) {
  console.error(error);
  process.exit(1);
}
