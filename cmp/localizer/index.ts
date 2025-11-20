import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';

const app = new Hono();

app.use('*', cors());

app.get('/i18n', (c) => {
  return c.json({});
});

const port = 3001;
console.log(`Localizer service running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
