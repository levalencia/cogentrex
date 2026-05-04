import { readEnv } from './config/env.js';
import { createApp } from './app.js';

async function main() {
  const env = readEnv();
  const { app } = await createApp(env);

  app.listen(env.API_PORT, () => {
    console.log(JSON.stringify({ level: 'info', event: 'api_listening', url: `http://localhost:${env.API_PORT}` }));
  });
}

main();
