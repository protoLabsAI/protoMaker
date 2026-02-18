import { Tag } from 'lucide-react';
import { Autocomplete } from '@protolabs/ui/molecules';

interface CategoryAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  error?: boolean;
  'data-testid'?: string;
}

export function CategoryAutocomplete({
  value,
  onChange,
  suggestions,
  placeholder = 'Select or type a category...',
  className,
  disabled = false,
  error = false,
  'data-testid': testId,
}: CategoryAutocompleteProps) {
  return (
    <Autocomplete
      value={value}
      onChange={onChange}
      options={suggestions}
      placeholder={placeholder}
      searchPlaceholder="Search or type new category..."
      emptyMessage="No category found."
      className={className}
      disabled={disabled}
      error={error}
      icon={Tag}
      allowCreate
      createLabel={(v) => `Create "${v}"`}
      data-testid={testId}
      itemTestIdPrefix="category-option"
    />
  );
}
