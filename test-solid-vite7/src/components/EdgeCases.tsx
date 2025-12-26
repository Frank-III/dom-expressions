import {
  createSignal,
  createMemo,
  For,
  Show,
  Switch,
  Match,
  children,
  splitProps,
  mergeProps,
  type ParentComponent,
  type JSX,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';

// Test: children(), splitProps(), mergeProps(), Dynamic, edge cases

// Component that uses children() helper
const Card: ParentComponent<{ title: string; footer?: JSX.Element }> = (props) => {
  const resolved = children(() => props.children);

  return (
    <div class="card">
      <div class="card-header">
        <h4>{props.title}</h4>
      </div>
      <div class="card-body">
        {resolved()}
      </div>
      <Show when={props.footer}>
        <div class="card-footer">{props.footer}</div>
      </Show>
    </div>
  );
};

// Component using splitProps
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  children?: JSX.Element;
  onClick?: () => void;
  class?: string;
  disabled?: boolean;
}

function Button(props: ButtonProps) {
  const [local, others] = splitProps(props, ['variant', 'size', 'loading', 'children']);
  const merged = mergeProps({ variant: 'primary', size: 'medium' }, local);

  return (
    <button
      {...others}
      class={`btn btn-${merged.variant} btn-${merged.size} ${props.class || ''}`}
      classList={{ loading: merged.loading }}
      disabled={props.disabled || merged.loading}
    >
      <Show when={merged.loading}>
        <span class="spinner" />
      </Show>
      {merged.children}
    </button>
  );
}

// Different component types for Dynamic
const components = {
  div: (props: { children?: JSX.Element }) => <div class="dynamic-div">{props.children}</div>,
  span: (props: { children?: JSX.Element }) => <span class="dynamic-span">{props.children}</span>,
  article: (props: { children?: JSX.Element }) => <article class="dynamic-article">{props.children}</article>,
};

export function EdgeCases() {
  const [componentType, setComponentType] = createSignal<keyof typeof components>('div');
  const [loading, setLoading] = createSignal(false);
  const [nestedLevel, setNestedLevel] = createSignal(3);
  const [items, setItems] = createSignal([
    { id: 1, type: 'A', value: 'First' },
    { id: 2, type: 'B', value: 'Second' },
    { id: 3, type: 'A', value: 'Third' },
    { id: 4, type: 'C', value: 'Fourth' },
  ]);

  // Nested Show/For/Switch combination
  const complexData = createMemo(() => ({
    show: items().length > 0,
    grouped: items().reduce((acc, item) => {
      acc[item.type] = acc[item.type] || [];
      acc[item.type].push(item);
      return acc;
    }, {} as Record<string, typeof items>),
  }));

  // Recursive component for deep nesting
  function NestedBox(props: { level: number; maxLevel: number }) {
    return (
      <div class="nested-box" style={{ padding: '10px', border: '1px solid #ccc', margin: '5px' }}>
        Level {props.level}
        <Show when={props.level < props.maxLevel}>
          <NestedBox level={props.level + 1} maxLevel={props.maxLevel} />
        </Show>
      </div>
    );
  }

  return (
    <div class="edge-cases">
      <h2>Edge Cases & Advanced Patterns</h2>

      {/* children() helper */}
      <section class="section">
        <h3>children() Helper</h3>
        <Card
          title="Card with Footer"
          footer={<button onClick={() => console.log('Footer clicked')}>Action</button>}
        >
          <p>This is the card content.</p>
          <p>It can have multiple children.</p>
        </Card>
        <Card title="Card without Footer">
          <p>Simple card with just content.</p>
        </Card>
      </section>

      {/* splitProps and mergeProps */}
      <section class="section">
        <h3>splitProps & mergeProps</h3>
        <div class="button-showcase">
          <Button variant="primary" onClick={() => console.log('Primary')}>
            Primary Button
          </Button>
          <Button variant="secondary" size="small">
            Small Secondary
          </Button>
          <Button variant="danger" size="large" disabled>
            Disabled Danger
          </Button>
          <Button loading={loading()} onClick={() => setLoading(!loading())}>
            {loading() ? 'Loading...' : 'Toggle Loading'}
          </Button>
        </div>
      </section>

      {/* Dynamic component */}
      <section class="section">
        <h3>Dynamic Component</h3>
        <div class="component-selector">
          <For each={Object.keys(components) as Array<keyof typeof components>}>
            {(type) => (
              <button
                classList={{ active: componentType() === type }}
                onClick={() => setComponentType(type)}
              >
                {type}
              </button>
            )}
          </For>
        </div>
        <Dynamic component={components[componentType()]}>
          Content inside dynamic component: {componentType()}
        </Dynamic>
      </section>

      {/* Complex nested Show/For/Switch */}
      <section class="section">
        <h3>Complex Nested Control Flow</h3>
        <Show
          when={complexData().show}
          fallback={<p>No items</p>}
        >
          <For each={Object.entries(complexData().grouped)}>
            {([type, groupItems]) => (
              <div class="group">
                <h4>Type: {type}</h4>
                <For each={groupItems as typeof items}>
                  {(item) => (
                    <div class="group-item">
                      <Switch fallback={<span>Unknown</span>}>
                        <Match when={item.type === 'A'}>
                          <span class="badge badge-a">A: {item.value}</span>
                        </Match>
                        <Match when={item.type === 'B'}>
                          <span class="badge badge-b">B: {item.value}</span>
                        </Match>
                        <Match when={item.type === 'C'}>
                          <span class="badge badge-c">C: {item.value}</span>
                        </Match>
                      </Switch>
                    </div>
                  )}
                </For>
              </div>
            )}
          </For>
        </Show>
      </section>

      {/* Deep nesting */}
      <section class="section">
        <h3>Deep Nesting (Recursive)</h3>
        <div class="nesting-control">
          <label>
            Nesting Level: {nestedLevel()}
            <input
              type="range"
              min="1"
              max="10"
              value={nestedLevel()}
              onInput={(e) => setNestedLevel(parseInt(e.currentTarget.value))}
            />
          </label>
        </div>
        <NestedBox level={1} maxLevel={nestedLevel()} />
      </section>

      {/* innerHTML and textContent */}
      <section class="section">
        <h3>innerHTML & textContent</h3>
        <div innerHTML="<strong>Bold HTML</strong> via innerHTML" />
        <div textContent="<strong>Escaped</strong> via textContent" />
      </section>

      {/* Empty and null handling */}
      <section class="section">
        <h3>Empty & Null Handling</h3>
        <div>{null}</div>
        <div>{undefined}</div>
        <div>{false}</div>
        <div>{0}</div>
        <div>{''}</div>
        <For each={[]}>
          {(item) => <span>{item}</span>}
        </For>
        <Show when={false}>
          <span>Should not render</span>
        </Show>
      </section>

      {/* Fragment edge cases */}
      <section class="section">
        <h3>Fragment Edge Cases</h3>
        <>
          <span>First</span>
          <span>Second</span>
          <>
            <span>Nested First</span>
            <span>Nested Second</span>
          </>
        </>
      </section>

      {/* Event handler variations */}
      <section class="section">
        <h3>Event Handler Variations</h3>
        <button onClick={() => console.log('Arrow function')}>Arrow</button>
        <button onClick={[console.log, 'Array syntax']}>Array Syntax</button>
        <button on:click={() => console.log('on: prefix')}>on: prefix</button>
        <button onMouseEnter={() => console.log('Mouse enter')}>Hover me</button>
        <input onInput={(e) => console.log('Input:', e.currentTarget.value)} placeholder="Type..." />
      </section>
    </div>
  );
}
