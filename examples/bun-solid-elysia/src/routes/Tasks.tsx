import { createSignal, createResource, For, Show, Suspense } from 'solid-js';

interface Task {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}

async function fetchTasks(): Promise<Task[]> {
  const res = await fetch('/api/tasks');
  if (!res.ok) throw new Error('Failed to fetch tasks');
  return res.json();
}

export function Tasks() {
  const [tasks, { mutate, refetch }] = createResource(fetchTasks);
  const [newTitle, setNewTitle] = createSignal('');
  const [pending, setPending] = createSignal<Set<string>>(new Set());

  const addTask = async (e: Event) => {
    e.preventDefault();
    const title = newTitle().trim();
    if (!title) return;

    // Optimistic: add temp task
    const tempId = `temp-${Date.now()}`;
    const tempTask: Task = {
      id: tempId,
      title,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    mutate((prev) => [tempTask, ...(prev || [])]);
    setNewTitle('');

    try {
      const created = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }).then((r) => r.json());

      // Replace temp with real task
      mutate((prev) => prev?.map((t) => (t.id === tempId ? created : t)));
    } catch {
      // Rollback on error
      mutate((prev) => prev?.filter((t) => t.id !== tempId));
    }
  };

  const toggleTask = async (task: Task) => {
    // Track pending state
    setPending((p) => new Set(p).add(task.id));

    // Optimistic update
    mutate((prev) => prev?.map((t) => (t.id === task.id ? { ...t, completed: !t.completed } : t)));

    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !task.completed }),
      });
    } catch {
      // Rollback
      mutate((prev) => prev?.map((t) => (t.id === task.id ? { ...t, completed: task.completed } : t)));
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(task.id);
        return next;
      });
    }
  };

  const deleteTask = async (id: string) => {
    setPending((p) => new Set(p).add(id));

    // Optimistic delete
    const backup = tasks();
    mutate((prev) => prev?.filter((t) => t.id !== id));

    try {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    } catch {
      // Rollback
      mutate(backup);
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(id);
        return next;
      });
    }
  };

  const completedCount = () => tasks()?.filter((t) => t.completed).length ?? 0;
  const totalCount = () => tasks()?.length ?? 0;

  return (
    <div class="tasks-container">
      <h1>Tasks</h1>

      <div class="card">
        <form onSubmit={addTask} class="task-form">
          <input
            type="text"
            placeholder="Add a new task..."
            value={newTitle()}
            onInput={(e) => setNewTitle(e.currentTarget.value)}
          />
          <button type="submit" disabled={!newTitle().trim()}>
            Add
          </button>
        </form>
      </div>

      <div class="card">
        <h3>Your Tasks</h3>

        <div class="stats">
          <span>
            {completedCount()}/{totalCount()} completed
          </span>
          <button type="button" onClick={() => refetch()} disabled={tasks.loading}>
            Refresh
          </button>
        </div>

        <Suspense fallback={<p class="loading">Loading tasks...</p>}>
          <Show when={!tasks.error} fallback={<p class="error">Error: {String(tasks.error)}</p>}>
            <Show when={tasks()?.length} fallback={<p class="empty">No tasks yet. Add one above!</p>}>
              <ul class="task-list">
                <For each={tasks()}>
                  {(task) => (
                    <li class="task-item" classList={{ completed: task.completed, pending: pending().has(task.id) }}>
                      <label class="task-label">
                        <input
                          class="task-checkbox"
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => toggleTask(task)}
                          disabled={pending().has(task.id)}
                        />
                        <span class="task-title">{task.title}</span>
                      </label>

                      <span class="task-date">{task.createdAt.slice(0, 10)}</span>

                      <div class="task-actions">
                        <button
                          class="delete"
                          onClick={() => deleteTask(task.id)}
                          disabled={pending().has(task.id)}
                          aria-label="Delete task"
                        >
                          &times;
                        </button>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </Suspense>
      </div>

      <div class="card">
        <h3>Solid Patterns Used</h3>
        <ul>
          <li><code>createResource</code> - Async data fetching with loading/error states</li>
          <li><code>mutate</code> - Optimistic updates before server confirms</li>
          <li><code>refetch</code> - Manual refresh of resource data</li>
          <li><code>&lt;For&gt;</code> - Efficient list rendering with keyed items</li>
          <li><code>&lt;Show&gt;</code> - Conditional rendering</li>
          <li><code>&lt;Suspense&gt;</code> - Loading boundary</li>
          <li><code>classList</code> - Dynamic class application</li>
        </ul>
      </div>
    </div>
  );
}
