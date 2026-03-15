/**
 * PromptInputProvider — Context for managing chat input value.
 *
 * Eliminates prop drilling of value/onChange between ChatInput
 * and its parent. Wrap the chat area with PromptInputProvider;
 * ChatInput reads and clears the value via usePromptInput().
 */

import { createContext, useCallback, useContext, useState } from 'react';

interface PromptInputContextValue {
  value: string;
  setValue: (v: string) => void;
  clear: () => void;
}

const PromptInputContext = createContext<PromptInputContextValue | null>(null);

export function PromptInputProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState('');
  const clear = useCallback(() => setValue(''), []);

  return (
    <PromptInputContext.Provider value={{ value, setValue, clear }}>
      {children}
    </PromptInputContext.Provider>
  );
}

export function usePromptInput(): PromptInputContextValue {
  const ctx = useContext(PromptInputContext);
  if (!ctx) {
    throw new Error('usePromptInput must be used within <PromptInputProvider>');
  }
  return ctx;
}
