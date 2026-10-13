try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
if (process.argv.includes('--dev')) process.env.NODE_ENV = 'development';
const { createApp } = await import('./api.js');
const app = await createApp();
const stop = async () => {
  await app.close();
  process.exit(0);
};
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
await app.listen({ port: Number(process.env.PORT ?? 3000), host: process.env.HOST ?? '0.0.0.0' });
