import * as React from 'react';
import { GitBranch } from 'lucide-react';
import { Autocomplete, AutocompleteOption } from '@protolabs/ui/molecules';

interface BranchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  branches: string[];
  branchCardCounts?: Record<string, number>; // Map of branch name to unarchived card count
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  error?: boolean;
  'data-testid'?: string;
}

export function BranchAutocomplete({
  value,
  onChange,
  branches,
  branchCardCounts,
  placeholder = 'Select a branch...',
  className,
  disabled = false,
  error = false,
  'data-testid': testId,
}: BranchAutocompleteProps) {
  // Always include "main" at the top of suggestions
  const branchOptions: AutocompleteOption[] = React.useMemo(() => {
    const branchSet = new Set(['main', ...branches]);
    return Array.from(branchSet).map((branch) => {
      const cardCount = branchCardCounts?.[branch];
      // Show card count if available, otherwise show "default" for main branch only
      const badge =
        branchCardCounts !== undefined
          ? String(cardCount ?? 0)
          : branch === 'main'
            ? 'default'
            : undefined;

      return {
        value: branch,
        label: branch,
        badge,
      };
    });
  }, [branches, branchCardCounts]);

  return (
    <Autocomplete
      value={value}
      onChange={onChange}
      options={branchOptions}
      placeholder={placeholder}
      searchPlaceholder="Search or type new branch..."
      emptyMessage="No branches found."
      className={className}
      disabled={disabled}
      error={error}
      icon={GitBranch}
      allowCreate
      createLabel={(v) => `Create "${v}"`}
      data-testid={testId}
      itemTestIdPrefix="branch-option"
    />
  );
}
