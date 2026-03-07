import { useState } from 'react';
import { ListTodo, Plus } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { PanelHeader } from '@/components/shared/panel-header';
import { useTodoLists } from '@/hooks/queries/use-todo-lists';
import {
  useCreateTodoList,
  useDeleteTodoList,
  useAddTodoItem,
  useUpdateTodoItem,
  useCompleteTodoItem,
  useDeleteTodoItem,
} from '@/hooks/mutations/use-todo-mutations';
import { TodoListCard } from './todo-list-card';

export function TodoView() {
  const currentProject = useAppStore((s) => s.currentProject);
  const projectPath = currentProject?.path;

  const { data: lists = [], isLoading } = useTodoLists(projectPath);

  const createList = useCreateTodoList(projectPath ?? '');
  const deleteList = useDeleteTodoList(projectPath ?? '');
  const addItem = useAddTodoItem(projectPath ?? '');
  const updateItem = useUpdateTodoItem(projectPath ?? '');
  const completeItem = useCompleteTodoItem(projectPath ?? '');
  const deleteItem = useDeleteTodoItem(projectPath ?? '');

  const [newListName, setNewListName] = useState('');

  const handleCreateList = () => {
    const name = newListName.trim();
    if (!name || !projectPath) return;
    createList.mutate(name);
    setNewListName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleCreateList();
  };

  const handleToggleItem = (listId: string, itemId: string, currentlyCompleted: boolean) => {
    if (!projectPath) return;
    if (currentlyCompleted) {
      // Uncomplete — set completed: false
      updateItem.mutate({ listId, itemId, updates: { completed: false, completedAt: undefined } });
    } else {
      completeItem.mutate({ listId, itemId });
    }
  };

  if (!projectPath) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader icon={ListTodo} title="Todo" />
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No project selected
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PanelHeader icon={ListTodo} title="Todo" />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Add new list */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="New list name..."
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          />
          <button
            onClick={handleCreateList}
            disabled={!newListName.trim() || createList.isPending}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create
          </button>
        </div>

        {/* Loading */}
        {isLoading && <div className="text-sm text-muted-foreground">Loading...</div>}

        {/* Empty state */}
        {!isLoading && lists.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <ListTodo className="h-10 w-10 opacity-30" />
            <p className="text-sm">No lists yet. Create one above.</p>
          </div>
        )}

        {/* Lists grid */}
        {lists.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {lists.map((list) => (
              <TodoListCard
                key={list.id}
                list={list}
                onDeleteList={(listId) => deleteList.mutate(listId)}
                onAddItem={(listId, title) => addItem.mutate({ listId, title })}
                onToggleItem={handleToggleItem}
                onDeleteItem={(listId, itemId) => deleteItem.mutate({ listId, itemId })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
