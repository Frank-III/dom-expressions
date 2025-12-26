import { createStore, produce } from 'solid-js/store';

export interface Todo {
  id: number;
  text: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
}

export interface TodoState {
  todos: Todo[];
  filter: 'all' | 'active' | 'completed';
  searchQuery: string;
}

export function createTodoStore() {
  const [state, setState] = createStore<TodoState>({
    todos: [
      { id: 1, text: 'Learn Solid.js', completed: true, priority: 'high', tags: ['learning'] },
      { id: 2, text: 'Build a project', completed: false, priority: 'medium', tags: ['project', 'coding'] },
      { id: 3, text: 'Write tests', completed: false, priority: 'low', tags: ['testing'] },
    ],
    filter: 'all',
    searchQuery: '',
  });

  const addTodo = (text: string, priority: Todo['priority'] = 'medium') => {
    setState('todos', (todos) => [
      ...todos,
      {
        id: Date.now(),
        text,
        completed: false,
        priority,
        tags: [],
      },
    ]);
  };

  const toggleTodo = (id: number) => {
    setState(
      'todos',
      (todo) => todo.id === id,
      'completed',
      (completed) => !completed
    );
  };

  const removeTodo = (id: number) => {
    setState('todos', (todos) => todos.filter((t) => t.id !== id));
  };

  const updateTodoPriority = (id: number, priority: Todo['priority']) => {
    setState(
      produce((s) => {
        const todo = s.todos.find((t) => t.id === id);
        if (todo) todo.priority = priority;
      })
    );
  };

  const addTag = (id: number, tag: string) => {
    setState(
      'todos',
      (todo) => todo.id === id,
      'tags',
      (tags) => [...tags, tag]
    );
  };

  const setFilter = (filter: TodoState['filter']) => {
    setState('filter', filter);
  };

  const setSearchQuery = (query: string) => {
    setState('searchQuery', query);
  };

  return {
    state,
    addTodo,
    toggleTodo,
    removeTodo,
    updateTodoPriority,
    addTag,
    setFilter,
    setSearchQuery,
  };
}
