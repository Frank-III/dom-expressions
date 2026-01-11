import { isServer } from 'solid-js/web';
import { Home } from './routes/Home';
import { Counter } from './routes/Counter';
import { About } from './routes/About';
import { Tasks } from './routes/Tasks';

// Simple manual routing for SSR compatibility
function getRouteComponent(path: string) {
  switch (path) {
    case '/counter':
      return Counter;
    case '/about':
      return About;
    case '/tasks':
      return Tasks;
    default:
      return Home;
  }
}

function Nav(props: { current: string }) {
  const links = [
    { href: '/', label: 'Home' },
    { href: '/counter', label: 'Counter' },
    { href: '/tasks', label: 'Tasks' },
    { href: '/about', label: 'About' },
  ];

  return (
    <nav>
      {links.map((link) => (
        <a
          href={link.href}
          class={props.current === link.href || (link.href === '/' && props.current === '/') ? 'active' : ''}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}

export function App(props: { url?: string }) {
  const path = props.url || '/';
  const RouteComponent = getRouteComponent(path);

  return (
    <div class="app">
      <Nav current={path} />
      <main>
        <RouteComponent />
      </main>
      <footer>
        Built with Bun + Solid + Elysia
      </footer>
    </div>
  );
}
