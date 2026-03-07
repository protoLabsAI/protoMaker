import { useState, useRef, useEffect } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TodoList } from '@protolabsai/types';

interface TodoListCardProps {
  list: TodoList;
  onDeleteList: (listId: string) => void;
  onAddItem: (listId: string, title: string) => void;
  onToggleItem: (listId: string, itemId: string, completed: boolean) => void;
  onDeleteItem: (listId: string, itemId: string) => void;
}

const PRIORITY_COLORS: Record<number, string> = {
  0: 'bg-muted-foreground/30',
  1: 'bg-blue-400',
  2: 'bg-yellow-400',
  3: 'bg-orange-400',
  4: 'bg-red-500',
};

const PRIORITY_LABELS: Record<number, string> = {
  0: 'none',
  1: 'low',
  2: 'medium',
  3: 'high',
  4: 'urgent',
};

export function TodoListCard({
  list,
  onDeleteList,
  onAddItem,
  onToggleItem,
  onDeleteItem,
}: TodoListCardProps) {
  const [newItemTitle, setNewItemTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const totalItems = list.items.length;
  const completedItems = list.items.filter((i) => i.completed).length;
  const completionPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  const handleAddItem = () => {
    const title = newItemTitle.trim();
    if (!title) return;
    onAddItem(list.id, title);
    setNewItemTitle('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAddItem();
  };

  return (
    <div className="flex flex-col rounded-lg border bg-card text-card-foreground shadow-sm">
      {/* Progress bar */}
      {totalItems > 0 && (
        <div className="h-1 w-full rounded-t-lg bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm truncate">{list.name}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            {completedItems}/{totalItems}
          </span>
        </div>
        <button
          onClick={() => onDeleteList(list.id)}
          className="text-muted-foreground hover:text-destructive transition-colors ml-2 p-1 rounded"
          aria-label="Delete list"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Items */}
      <div className="flex flex-col divide-y">
        {list.items.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground italic">No items yet</p>
        ) : (
          list.items.map((item) => (
            <div
              key={item.id}
              className="group flex items-center gap-2 px-4 py-2 hover:bg-muted/40 transition-colors"
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={item.completed}
                onChange={() => onToggleItem(list.id, item.id, item.completed)}
                className="accent-primary h-4 w-4 shrink-0 cursor-pointer"
              />

              {/* Title + priority badge */}
              <div className="flex flex-1 items-center gap-2 min-w-0">
                <span
                  className={cn(
                    'text-sm flex-1 truncate',
                    item.completed && 'line-through text-muted-foreground'
                  )}
                >
                  {item.title}
                </span>

                {item.priority > 0 && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full text-white shrink-0',
                      PRIORITY_COLORS[item.priority]
                    )}
                    title={`Priority: ${PRIORITY_LABELS[item.priority]}`}
                  >
                    <span
                      className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_COLORS[item.priority])}
                    />
                    {PRIORITY_LABELS[item.priority]}
                  </span>
                )}

                {item.dueDate && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(item.dueDate).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* Delete item button (visible on hover) */}
              <button
                onClick={() => onDeleteItem(list.id, item.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded"
                aria-label="Delete item"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add item input */}
      <div className="flex items-center gap-2 px-4 py-2 border-t">
        <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={newItemTitle}
          onChange={(e) => setNewItemTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add item..."
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
        />
        {newItemTitle.trim() && (
          <button onClick={handleAddItem} className="text-xs text-primary hover:underline">
            Add
          </button>
        )}
      </div>
    </div>
  );
}
