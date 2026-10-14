import { buildApp } from './app';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await buildApp().listen({ port, host });
} catch (error) {
  console.error(error);
  process.exit(1);
}
