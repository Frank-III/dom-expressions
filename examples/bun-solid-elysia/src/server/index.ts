import { Elysia, t } from 'elysia';
import { renderToStringAsync } from 'solid-js/web';
import { App } from '../App';

const isDev = process.env.NODE_ENV !== 'production';
const port = process.env.PORT || 3000;
const startTime = Date.now();
let requestCount = 0;

// Mock data - Tasks
interface Task {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}

let tasks: Task[] = [
  { id: '1', title: 'Learn Solid.js reactivity', completed: true, createdAt: '2024-01-01T10:00:00Z' },
  { id: '2', title: 'Build SSR app with Elysia', completed: true, createdAt: '2024-01-02T14:30:00Z' },
  { id: '3', title: 'Add createResource for data fetching', completed: false, createdAt: '2024-01-03T09:15:00Z' },
  { id: '4', title: 'Implement optimistic updates', completed: false, createdAt: '2024-01-04T16:45:00Z' },
];

// CSS styles
const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    line-height: 1.6;
    background: #0f172a;
    color: #e2e8f0;
    min-height: 100vh;
  }
  .app {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  nav {
    display: flex;
    gap: 1rem;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #334155;
  }
  nav a {
    color: #38bdf8;
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    transition: background 0.2s;
  }
  nav a:hover { background: #1e293b; }
  nav a.active { background: #0ea5e9; color: white; }
  main { flex: 1; }
  footer {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid #334155;
    color: #64748b;
    font-size: 0.875rem;
    text-align: center;
  }
  h1 { margin-bottom: 1.5rem; color: #f1f5f9; }
  h3 { margin-bottom: 0.75rem; color: #cbd5e1; }
  .card {
    background: #1e293b;
    padding: 1.5rem;
    border-radius: 0.75rem;
    margin: 1rem 0;
    border: 1px solid #334155;
  }
  ul, ol { padding-left: 1.5rem; margin: 0.5rem 0; }
  li { margin: 0.25rem 0; }
  code {
    background: #334155;
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
  }
  .count {
    font-size: 3rem;
    font-weight: bold;
    margin: 1rem 0;
    color: #38bdf8;
  }
  .buttons {
    display: flex;
    gap: 0.5rem;
  }
  button {
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    cursor: pointer;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 0.5rem;
    transition: background 0.2s;
  }
  button:hover { background: #2563eb; }
  button:active { background: #1d4ed8; }
  button.delete { background: #ef4444; }
  button.delete:hover { background: #dc2626; }
  
  /* Tasks */
  .tasks-container { display: flex; flex-direction: column; gap: 1rem; }
  .task-form { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
  .task-form input {
    flex: 1;
    padding: 0.75rem 1rem;
    font-size: 1rem;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 0.5rem;
    color: #e2e8f0;
    outline: none;
  }
  .task-form input:focus { border-color: #3b82f6; }
  .task-form input::placeholder { color: #64748b; }
  .task-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .task-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    background: #1e293b;
    border-radius: 0.5rem;
    border: 1px solid #334155;
    transition: border-color 0.2s;
  }
  .task-item:hover { border-color: #475569; }
  .task-item.completed { opacity: 0.6; }
  .task-item.pending { opacity: 0.85; }
  .task-item.completed .task-title { text-decoration: line-through; color: #64748b; }
  .task-checkbox {
    width: 1.25rem;
    height: 1.25rem;
    cursor: pointer;
    accent-color: #22c55e;
  }
  .task-label {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
  }
  .task-title { flex: 1; }
  .task-date { font-size: 0.75rem; color: #64748b; }
  .task-actions button {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
  }
  .loading { color: #64748b; font-style: italic; }
  .error { color: #ef4444; padding: 1rem; background: #1e293b; border-radius: 0.5rem; }
  .empty { color: #64748b; text-align: center; padding: 2rem; }
  .stats { display: flex; gap: 1rem; margin-bottom: 1rem; font-size: 0.875rem; color: #64748b; }
`;

// HTML template
function htmlTemplate(appHtml: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bun + Solid + Elysia</title>
  <style>${styles}</style>
</head>
<body>
  <div id="app">${appHtml}</div>
  <script type="module" src="/dist/client.js"></script>
</body>
</html>`;
}

// Create Elysia server
const app = new Elysia()
  // API Routes
  .group('/api', (app) =>
    app
      .get('/stats', () => {
        requestCount++;
        return {
          uptime: Math.floor((Date.now() - startTime) / 1000),
          memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          requests: requestCount,
        };
      })
      .get('/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))
      // Tasks CRUD
      .get('/tasks', () => tasks)
      .post('/tasks', ({ body }) => {
        const task: Task = {
          id: crypto.randomUUID(),
          title: body.title,
          completed: false,
          createdAt: new Date().toISOString(),
        };
        tasks = [task, ...tasks];
        return task;
      }, {
        body: t.Object({
          title: t.String({ minLength: 1 }),
        }),
      })
      .patch('/tasks/:id', ({ params, body }) => {
        const task = tasks.find((t) => t.id === params.id);
        if (!task) {
          throw new Error('Task not found');
        }
        if (body.completed !== undefined) task.completed = body.completed;
        if (body.title !== undefined) task.title = body.title;
        return task;
      }, {
        params: t.Object({ id: t.String() }),
        body: t.Object({
          completed: t.Optional(t.Boolean()),
          title: t.Optional(t.String({ minLength: 1 })),
        }),
      })
      .delete('/tasks/:id', ({ params }) => {
        const index = tasks.findIndex((t) => t.id === params.id);
        if (index === -1) {
          throw new Error('Task not found');
        }
        const [deleted] = tasks.splice(index, 1);
        return deleted;
      }, {
        params: t.Object({ id: t.String() }),
      })
  )

  // Static files - dist folder
  .get('/dist/*', async ({ params }) => {
    const filePath = `./dist/${params['*']}`;
    const file = Bun.file(filePath);

    if (await file.exists()) {
      const ext = filePath.split('.').pop();
      const contentType = ext === 'js' ? 'application/javascript'
        : ext === 'css' ? 'text/css'
        : ext === 'map' ? 'application/json'
        : 'application/octet-stream';

      return new Response(file, {
        headers: { 'Content-Type': contentType },
      });
    }
    return new Response('Not found', { status: 404 });
  })

  // Static files - public folder
  .get('/public/*', async ({ params }) => {
    const filePath = `./public/${params['*']}`;
    const file = Bun.file(filePath);

    if (await file.exists()) {
      return new Response(file);
    }
    return new Response('Not found', { status: 404 });
  })

  // SSR - catch all routes
  .get('*', async ({ request }) => {
    requestCount++;
    const url = new URL(request.url);

    // Skip API and static routes
    if (url.pathname.startsWith('/api') || url.pathname.startsWith('/dist') || url.pathname.startsWith('/public')) {
      return new Response('Not found', { status: 404 });
    }

    try {
      const appHtml = await renderToStringAsync(() => App({ url: url.pathname }));

      return new Response(htmlTemplate(appHtml), {
        headers: { 'Content-Type': 'text/html' },
      });
    } catch (error) {
      console.error('SSR Error:', error);

      if (isDev) {
        return new Response(`
          <html>
            <head><title>SSR Error</title></head>
            <body style="font-family: monospace; padding: 2rem; background: #1e1e1e; color: #ff6b6b;">
              <h1>SSR Error</h1>
              <pre>${error instanceof Error ? error.stack : String(error)}</pre>
            </body>
          </html>
        `, {
          status: 500,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      return new Response('Server Error', { status: 500 });
    }
  })

  .listen(port);

console.log(`🚀 Server running at http://localhost:${port}`);
console.log(`📦 Mode: ${isDev ? 'development' : 'production'}`);

export type App = typeof app;
