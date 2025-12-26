import { createSignal, Show, For } from 'solid-js';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { Counter } from './components/Counter';
import { TodoList } from './components/TodoList';
import { AdvancedFeatures, clickOutside, tooltip, autofocus } from './components/AdvancedFeatures';
import { AsyncFeatures } from './components/AsyncFeatures';
import { EdgeCases } from './components/EdgeCases';
import './App.css';

// Register directives
clickOutside;
tooltip;
autofocus;

type TabId = 'counter' | 'todos' | 'advanced' | 'async' | 'edge';

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'counter', label: 'Counter & Signals' },
  { id: 'todos', label: 'Todo Store' },
  { id: 'advanced', label: 'Advanced Features' },
  { id: 'async', label: 'Async & Resources' },
  { id: 'edge', label: 'Edge Cases' },
];

function AppContent() {
  const [activeTab, setActiveTab] = createSignal<TabId>('counter');
  const { theme, setTheme, isDark } = useTheme();

  return (
    <div class="app" classList={{ dark: isDark() }}>
      <header class="app-header">
        <h1>Solid.js OXC Compiler Test App</h1>
        <div class="theme-selector">
          <label>Theme:</label>
          <select value={theme()} onChange={(e) => setTheme(e.currentTarget.value as any)}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">System</option>
          </select>
        </div>
      </header>

      <nav class="app-nav">
        <For each={tabs}>
          {(tab) => (
            <button
              class="nav-button"
              classList={{ active: activeTab() === tab.id }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          )}
        </For>
      </nav>

      <main class="app-main">
        <Show when={activeTab() === 'counter'}>
          <Counter />
        </Show>
        <Show when={activeTab() === 'todos'}>
          <TodoList />
        </Show>
        <Show when={activeTab() === 'advanced'}>
          <AdvancedFeatures />
        </Show>
        <Show when={activeTab() === 'async'}>
          <AsyncFeatures />
        </Show>
        <Show when={activeTab() === 'edge'}>
          <EdgeCases />
        </Show>
      </main>

      <footer class="app-footer">
        <p>Testing solid-jsx-oxc compiler with complex patterns</p>
        <p>Active Tab: {activeTab()} | Theme: {theme()} | Dark Mode: {isDark() ? 'Yes' : 'No'}</p>
      </footer>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
