import {
  createSignal,
  createResource,
  Suspense,
  ErrorBoundary,
  Show,
  For,
  lazy,
  createEffect,
} from 'solid-js';

// Simulated API fetch
async function fetchUser(id: number): Promise<{ id: number; name: string; email: string }> {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (id === 0) {
    throw new Error('User not found');
  }
  return {
    id,
    name: `User ${id}`,
    email: `user${id}@example.com`,
  };
}

async function fetchPosts(userId: number): Promise<Array<{ id: number; title: string }>> {
  await new Promise((resolve) => setTimeout(resolve, 800));
  return [
    { id: 1, title: `Post 1 by user ${userId}` },
    { id: 2, title: `Post 2 by user ${userId}` },
    { id: 3, title: `Post 3 by user ${userId}` },
  ];
}

// Lazy loaded component
const LazyComponent = lazy(async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return {
    default: () => (
      <div class="lazy-component">
        <h4>Lazy Loaded Component</h4>
        <p>This component was loaded lazily!</p>
      </div>
    ),
  };
});

// Test: Suspense, ErrorBoundary, createResource, lazy
export function AsyncFeatures() {
  const [userId, setUserId] = createSignal(1);
  const [showLazy, setShowLazy] = createSignal(false);

  // Resource with source signal
  const [user, { mutate, refetch }] = createResource(userId, fetchUser);

  // Dependent resource
  const [posts] = createResource(
    () => (user() ? user()!.id : null),
    (id) => (id ? fetchPosts(id) : Promise.resolve([]))
  );

  // Track loading states
  createEffect(() => {
    console.log('User loading:', user.loading);
    console.log('User data:', user());
    console.log('User error:', user.error);
  });

  return (
    <div class="async-features">
      <h2>Async Features</h2>

      {/* User selector */}
      <section class="section">
        <h3>User Selection</h3>
        <div class="user-selector">
          <For each={[1, 2, 3, 0]}>
            {(id) => (
              <button
                classList={{ active: userId() === id }}
                onClick={() => setUserId(id)}
              >
                {id === 0 ? 'Invalid User' : `User ${id}`}
              </button>
            )}
          </For>
          <button onClick={() => refetch()}>Refetch</button>
        </div>
      </section>

      {/* User data with error boundary */}
      <section class="section">
        <h3>User Data (with ErrorBoundary)</h3>
        <ErrorBoundary
          fallback={(err, reset) => (
            <div class="error-container">
              <p class="error-message">Error: {err.message}</p>
              <button onClick={reset}>Try Again</button>
            </div>
          )}
        >
          <Suspense fallback={<div class="loading">Loading user...</div>}>
            <UserDisplay user={user()} />
          </Suspense>
        </ErrorBoundary>
      </section>

      {/* Posts with nested suspense */}
      <section class="section">
        <h3>User Posts (Nested Suspense)</h3>
        <Suspense fallback={<div class="loading">Loading posts...</div>}>
          <Show when={posts()} fallback={<p>No posts</p>}>
            <ul class="posts-list">
              <For each={posts()}>
                {(post) => (
                  <li class="post-item">
                    <strong>#{post.id}</strong>: {post.title}
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Suspense>
      </section>

      {/* Resource state display */}
      <section class="section">
        <h3>Resource State</h3>
        <div class="resource-state">
          <p>Loading: {user.loading ? 'Yes' : 'No'}</p>
          <p>Error: {user.error ? user.error.message : 'None'}</p>
          <p>State: {user.state}</p>
        </div>
        <button
          onClick={() => mutate((prev) => (prev ? { ...prev, name: prev.name + ' (mutated)' } : prev))}
          disabled={!user()}
        >
          Mutate User Name
        </button>
      </section>

      {/* Lazy component */}
      <section class="section">
        <h3>Lazy Loading</h3>
        <button onClick={() => setShowLazy(!showLazy())}>
          {showLazy() ? 'Hide' : 'Show'} Lazy Component
        </button>
        <Show when={showLazy()}>
          <Suspense fallback={<div class="loading">Loading component...</div>}>
            <LazyComponent />
          </Suspense>
        </Show>
      </section>
    </div>
  );
}

// Nested component that uses the resource data
function UserDisplay(props: { user: { id: number; name: string; email: string } | undefined }) {
  return (
    <Show when={props.user} fallback={<p>No user data</p>}>
      <div class="user-card">
        <h4>{props.user!.name}</h4>
        <p>ID: {props.user!.id}</p>
        <p>Email: {props.user!.email}</p>
      </div>
    </Show>
  );
}
