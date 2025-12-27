import { createSignal, createMemo, For, Show, Switch, Match } from 'solid-js';
import { createTodoStore, type Todo } from '../stores/todoStore';

// Test: Stores, For, Show, Switch/Match, nested components, complex state
export function TodoList() {
  const { state, addTodo, toggleTodo, removeTodo, updateTodoPriority, setFilter, setSearchQuery } = createTodoStore();
  const [newTodoText, setNewTodoText] = createSignal('');
  const [newPriority, setNewPriority] = createSignal<Todo['priority']>('medium');

  // Computed filtered todos
  const filteredTodos = createMemo(() => {
    let todos = state.todos;

    // Filter by status
    if (state.filter === 'active') {
      todos = todos.filter((t) => !t.completed);
    } else if (state.filter === 'completed') {
      todos = todos.filter((t) => t.completed);
    }

    // Filter by search query
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      todos = todos.filter(
        (t) =>
          t.text.toLowerCase().includes(query) ||
          t.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    return todos;
  });

  const todoStats = createMemo(() => ({
    total: state.todos.length,
    completed: state.todos.filter((t) => t.completed).length,
    active: state.todos.filter((t) => !t.completed).length,
    highPriority: state.todos.filter((t) => t.priority === 'high' && !t.completed).length,
  }));

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const text = newTodoText().trim();
    if (text) {
      addTodo(text, newPriority());
      setNewTodoText('');
    }
  };

  return (
    <div class="todo-list-container">
      <h2>Todo List with Store</h2>

      {/* Stats display */}
      <div class="todo-stats">
        <span>Total: {todoStats().total}</span>
        <span>Active: {todoStats().active}</span>
        <span>Completed: {todoStats().completed}</span>
        <Show when={todoStats().highPriority > 0}>
          <span class="high-priority-warning">
            High Priority: {todoStats().highPriority}
          </span>
        </Show>
      </div>

      {/* Add todo form */}
      <form onSubmit={handleSubmit} class="todo-form">
        <input
          type="text"
          value={newTodoText()}
          onInput={(e) => setNewTodoText(e.currentTarget.value)}
          placeholder="Add a new todo..."
        />
        <select
          value={newPriority()}
          onChange={(e) => setNewPriority(e.currentTarget.value as Todo['priority'])}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <button type="submit">Add</button>
      </form>

      {/* Search and filter */}
      <div class="todo-filters">
        <input
          type="search"
          value={state.searchQuery}
          onInput={(e) => setSearchQuery(e.currentTarget.value)}
          placeholder="Search todos..."
        />
        <div class="filter-buttons">
          <button
            classList={{ active: state.filter === 'all' }}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            classList={{ active: state.filter === 'active' }}
            onClick={() => setFilter('active')}
          >
            Active
          </button>
          <button
            classList={{ active: state.filter === 'completed' }}
            onClick={() => setFilter('completed')}
          >
            Completed
          </button>
        </div>
      </div>

      {/* Todo list */}
      <Show
        when={filteredTodos().length > 0}
        fallback={<p class="empty-state">No todos found</p>}
      >
        <ul class="todo-items">
          <For each={filteredTodos()}>
            {(todo, index) => (
              <TodoItem
                todo={todo}
                index={index()}
                onToggle={() => toggleTodo(todo.id)}
                onRemove={() => removeTodo(todo.id)}
                onPriorityChange={(p) => updateTodoPriority(todo.id, p)}
              />
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

// Nested component with props
interface TodoItemProps {
  todo: Todo;
  index: number;
  onToggle: () => void;
  onRemove: () => void;
  onPriorityChange: (priority: Todo['priority']) => void;
}

function TodoItem(props: TodoItemProps) {
  return (
    <li
      class="todo-item"
      classList={{
        completed: props.todo.completed,
        'high-priority': props.todo.priority === 'high',
        'medium-priority': props.todo.priority === 'medium',
        'low-priority': props.todo.priority === 'low',
      }}
    >
      <span class="todo-index">#{props.index + 1}</span>

      <input
        type="checkbox"
        checked={props.todo.completed}
        onChange={props.onToggle}
      />

      <span class="todo-text">{props.todo.text}</span>

      {/* Priority indicator using Switch/Match */}
      <Switch>
        <Match when={props.todo.priority === 'high'}>
          <span class="priority-badge high">!!!</span>
        </Match>
        <Match when={props.todo.priority === 'medium'}>
          <span class="priority-badge medium">!!</span>
        </Match>
        <Match when={props.todo.priority === 'low'}>
          <span class="priority-badge low">!</span>
        </Match>
      </Switch>

      {/* Tags */}
      <Show when={props.todo.tags.length > 0}>
        <div class="todo-tags">
          <For each={props.todo.tags}>
            {(tag) => <span class="tag">{tag}</span>}
          </For>
        </div>
      </Show>

      {/* Priority selector */}
      <select
        value={props.todo.priority}
        onChange={(e) => props.onPriorityChange(e.currentTarget.value as Todo['priority'])}
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>

      <button class="remove-btn" onClick={props.onRemove}>
        Remove
      </button>
    </li>
  );
}
