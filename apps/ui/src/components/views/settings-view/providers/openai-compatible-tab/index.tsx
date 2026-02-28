import React, { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, ChevronLeft, Server, Globe, Key, X, Info } from 'lucide-react';
import { Button } from '@protolabs-ai/ui/atoms';
import { Input } from '@protolabs-ai/ui/atoms';
import { Label } from '@protolabs-ai/ui/atoms';
import { Switch } from '@protolabs-ai/ui/atoms';
import { type OpenAICompatibleConfig, type ProviderModel } from '@protolabs-ai/types';
import { useAIModelsStore } from '@/store/ai-models-store';
import { cn } from '@/lib/utils';

// ============================================================================
// Local template definitions (mirrors @protolabs-ai/types OPENAI_COMPATIBLE_TEMPLATES)
// Defined locally to avoid dependency on the built dist during development.
// ============================================================================

interface OpenAICompatibleTemplate {
  templateId: string;
  name: string;
  baseUrl: string;
  description: string;
  apiKeyUrl?: string;
  defaultModels: ProviderModel[];
  requiresApiKey?: boolean;
}

const OPENAI_COMPATIBLE_TEMPLATES: OpenAICompatibleTemplate[] = [
  {
    templateId: 'ollama',
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    description: 'Run open-source LLMs locally with Ollama',
    requiresApiKey: false,
    defaultModels: [
      { id: 'llama3.2', displayName: 'Llama 3.2' },
      { id: 'mistral', displayName: 'Mistral' },
      { id: 'codellama', displayName: 'Code Llama' },
    ],
  },
  {
    templateId: 'lmstudio',
    name: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    description: 'Run local LLMs with LM Studio',
    requiresApiKey: false,
    defaultModels: [{ id: 'local-model', displayName: 'Local Model' }],
  },
  {
    templateId: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    description: 'Access 200+ open-source models via Together AI',
    apiKeyUrl: 'https://api.together.ai/settings/api-keys',
    requiresApiKey: true,
    defaultModels: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', displayName: 'Llama 3.3 70B Turbo' },
      { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', displayName: 'Mixtral 8x7B' },
    ],
  },
  {
    templateId: 'custom',
    name: 'Custom',
    baseUrl: '',
    description: 'Configure a custom OpenAI-compatible endpoint',
    requiresApiKey: false,
    defaultModels: [],
  },
];

// ============================================================================
// Helpers
// ============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

// ============================================================================
// Model Row (in edit form)
// ============================================================================

interface ModelRowProps {
  model: ProviderModel;
  onUpdate: (updated: ProviderModel) => void;
  onRemove: () => void;
}

function ModelRow({ model, onUpdate, onRemove }: ModelRowProps) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-accent/10 border border-border/20">
      <div className="flex-1 grid grid-cols-2 gap-2">
        <Input
          placeholder="Model ID (e.g. llama3.2)"
          value={model.id}
          onChange={(e) => onUpdate({ ...model, id: e.target.value })}
          className="text-sm h-8"
        />
        <Input
          placeholder="Display Name"
          value={model.displayName}
          onChange={(e) => onUpdate({ ...model, displayName: e.target.value })}
          className="text-sm h-8"
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
        onClick={onRemove}
        aria-label="Remove model"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ============================================================================
// Provider Form (add / edit)
// ============================================================================

interface ProviderFormProps {
  provider: OpenAICompatibleConfig | null;
  template?: OpenAICompatibleTemplate;
  onSave: (data: OpenAICompatibleConfig) => Promise<void>;
  onBack: () => void;
}

function ProviderForm({ provider, template, onSave, onBack }: ProviderFormProps) {
  const [name, setName] = useState(provider?.name ?? template?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? template?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState(provider?.apiKey ?? '');
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<ProviderModel[]>(
    provider?.models ?? template?.defaultModels ?? []
  );
  const [isSaving, setIsSaving] = useState(false);

  const addModel = useCallback(() => {
    setModels((prev) => [...prev, { id: '', displayName: '' }]);
  }, []);

  const updateModel = useCallback((index: number, updated: ProviderModel) => {
    setModels((prev) => prev.map((m, i) => (i === index ? updated : m)));
  }, []);

  const removeModel = useCallback((index: number) => {
    setModels((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      toast.error('Provider name is required');
      return;
    }
    if (!baseUrl.trim()) {
      toast.error('Base URL is required');
      return;
    }
    const validModels = models.filter((m) => m.id.trim() && m.displayName.trim());

    setIsSaving(true);
    try {
      await onSave({
        id: provider?.id ?? generateId(),
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        apiKeySource: apiKey.trim() ? 'inline' : 'inline',
        apiKey: apiKey.trim() || undefined,
        enabled: provider?.enabled ?? true,
        models: validModels,
      });
    } finally {
      setIsSaving(false);
    }
  }, [name, baseUrl, apiKey, models, provider, onSave]);

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 text-muted-foreground">
        <ChevronLeft className="h-4 w-4" />
        Back to providers
      </Button>

      <div>
        <h3 className="text-lg font-semibold text-foreground tracking-tight">
          {provider ? 'Edit Provider' : 'Add Provider'}
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          {provider
            ? 'Update your OpenAI-compatible provider configuration.'
            : 'Configure a new OpenAI-compatible API endpoint.'}
        </p>
      </div>

      {/* Form card */}
      <div
        className={cn(
          'rounded-lg overflow-hidden',
          'border border-border/50',
          'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
          'shadow-sm shadow-black/5'
        )}
      >
        <div className="p-4 space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-muted-foreground" />
              Provider Name
            </Label>
            <Input
              placeholder="e.g. Local Ollama"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="openai-compat-provider-name"
            />
          </div>

          {/* Base URL */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              Base URL
            </Label>
            <Input
              placeholder="e.g. http://localhost:11434/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              data-testid="openai-compat-base-url"
            />
            <p className="text-xs text-muted-foreground">
              The base URL for the OpenAI-compatible API endpoint (without trailing slash).
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-muted-foreground" />
              API Key
              <span className="text-xs font-normal text-muted-foreground">
                (optional for local providers)
              </span>
            </Label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="pr-20 font-mono text-sm"
                data-testid="openai-compat-api-key"
              />
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 h-7 px-2 text-xs"
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? 'Hide' : 'Show'}
              </Button>
            </div>
          </div>
        </div>

        {/* Models section */}
        <div className="border-t border-border/50">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-medium text-foreground">Models</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Add models exposed by this provider.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={addModel}
                className="gap-1.5 text-xs"
                data-testid="openai-compat-add-model"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Model
              </Button>
            </div>

            <div className="space-y-2">
              {models.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  No models configured. Add at least one model to use this provider.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 px-2 text-xs text-muted-foreground font-medium">
                    <span>Model ID</span>
                    <span>Display Name</span>
                  </div>
                  {models.map((model, index) => (
                    <ModelRow
                      key={index}
                      model={model}
                      onUpdate={(updated) => updateModel(index, updated)}
                      onRemove={() => removeModel(index)}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-border/50 flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            data-testid="openai-compat-save-provider"
            className={cn(
              'min-w-[120px]',
              'bg-gradient-to-r from-violet-500 to-violet-600',
              'hover:from-violet-600 hover:to-violet-700',
              'text-white font-medium border-0',
              'shadow-md shadow-violet-500/20 hover:shadow-lg hover:shadow-violet-500/25',
              'transition-all duration-200 ease-out'
            )}
          >
            {isSaving ? 'Saving...' : provider ? 'Save Changes' : 'Add Provider'}
          </Button>
          <Button variant="outline" onClick={onBack}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Template Picker
// ============================================================================

const CUSTOM_TEMPLATE: OpenAICompatibleTemplate = {
  templateId: 'custom',
  name: 'Custom Provider',
  baseUrl: '',
  description: 'Configure a custom OpenAI-compatible endpoint',
  defaultModels: [],
};

interface TemplatePickerProps {
  onSelect: (template: OpenAICompatibleTemplate) => void;
  onBack: () => void;
}

function TemplatePicker({ onSelect, onBack }: TemplatePickerProps) {
  const templates = [...OPENAI_COMPATIBLE_TEMPLATES, CUSTOM_TEMPLATE];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 text-muted-foreground">
        <ChevronLeft className="h-4 w-4" />
        Back to providers
      </Button>

      <div>
        <h3 className="text-lg font-semibold text-foreground tracking-tight">Choose a Template</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Select a pre-configured template or start from scratch.
        </p>
      </div>

      <div className="grid gap-3">
        {templates.map((template) => (
          <button
            key={template.templateId}
            onClick={() => onSelect(template)}
            data-testid={`openai-compat-template-${template.templateId}`}
            className={cn(
              'w-full text-left p-4 rounded-lg',
              'border border-border/50 bg-card/80',
              'hover:bg-accent/30 hover:border-violet-500/30',
              'transition-all duration-150 cursor-pointer',
              'group'
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">{template.name}</span>
                  {template.apiKeyUrl && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-medium">
                      API Key
                    </span>
                  )}
                  {!template.apiKeyUrl && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 font-medium">
                      Local
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                {template.baseUrl && (
                  <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">
                    {template.baseUrl}
                  </p>
                )}
              </div>
              <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-180 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Provider Card (list item)
// ============================================================================

interface ProviderCardProps {
  provider: OpenAICompatibleConfig;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}

function ProviderCard({ provider, onEdit, onDelete, onToggle }: ProviderCardProps) {
  const isEnabled = provider.enabled !== false;

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg',
        'border transition-colors',
        isEnabled
          ? 'border-border/50 bg-card/60 hover:bg-accent/20'
          : 'border-border/30 bg-card/30 opacity-60'
      )}
      data-testid={`openai-compat-provider-card-${provider.id}`}
    >
      {/* Icon */}
      <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
        <Server className="w-4 h-4 text-violet-500" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{provider.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0">
            {provider.models.length} model{provider.models.length !== 1 ? 's' : ''}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{provider.baseUrl}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Switch
          checked={isEnabled}
          onCheckedChange={onToggle}
          aria-label={`Toggle ${provider.name}`}
          data-testid={`openai-compat-toggle-${provider.id}`}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onEdit}
          aria-label={`Edit ${provider.name}`}
          data-testid={`openai-compat-edit-${provider.id}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={onDelete}
          aria-label={`Delete ${provider.name}`}
          data-testid={`openai-compat-delete-${provider.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
        <Server className="w-6 h-6 text-violet-500" />
      </div>
      <h4 className="text-sm font-medium text-foreground mb-1">No providers configured</h4>
      <p className="text-sm text-muted-foreground max-w-xs">
        Add an OpenAI-compatible provider to use local models (Ollama, LM Studio) or cloud APIs.
      </p>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

type ViewState =
  | { mode: 'list' }
  | { mode: 'template-picker' }
  | {
      mode: 'edit';
      provider: OpenAICompatibleConfig | null;
      template?: OpenAICompatibleTemplate;
    };

export function OpenAICompatibleTab() {
  const [view, setView] = useState<ViewState>({ mode: 'list' });
  const {
    openaiCompatibleProviders,
    addOpenAICompatibleProvider,
    updateOpenAICompatibleProvider,
    deleteOpenAICompatibleProvider,
    toggleOpenAICompatibleProviderEnabled,
  } = useAIModelsStore();

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteOpenAICompatibleProvider(id);
      toast.success('Provider removed');
    },
    [deleteOpenAICompatibleProvider]
  );

  const handleSave = useCallback(
    async (data: OpenAICompatibleConfig) => {
      const isEditing = view.mode === 'edit' && view.provider !== null;
      if (isEditing && view.mode === 'edit' && view.provider) {
        await updateOpenAICompatibleProvider(view.provider.id, data);
        toast.success('Provider updated');
      } else {
        await addOpenAICompatibleProvider(data);
        toast.success('Provider added');
      }
      setView({ mode: 'list' });
    },
    [view, addOpenAICompatibleProvider, updateOpenAICompatibleProvider]
  );

  if (view.mode === 'template-picker') {
    return (
      <TemplatePicker
        onSelect={(template) => setView({ mode: 'edit', provider: null, template })}
        onBack={() => setView({ mode: 'list' })}
      />
    );
  }

  if (view.mode === 'edit') {
    return (
      <ProviderForm
        provider={view.provider}
        template={view.template}
        onSave={handleSave}
        onBack={() => setView({ mode: 'list' })}
      />
    );
  }

  // List view
  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
        <Info className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
        <div className="text-sm text-violet-400/90">
          <span className="font-medium">OpenAI-Compatible APIs</span>
          <p className="text-xs text-violet-400/70 mt-1">
            Connect local models (Ollama, LM Studio) or cloud APIs that implement the OpenAI Chat
            Completions protocol. Models appear in all model selectors, grouped by provider name.
          </p>
        </div>
      </div>

      {/* Header with Add button */}
      <div
        className={cn(
          'rounded-lg overflow-hidden',
          'border border-border/50',
          'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
          'shadow-sm shadow-black/5'
        )}
      >
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              Configured Providers
            </h2>
            <p className="text-sm text-muted-foreground/80 mt-0.5">
              {openaiCompatibleProviders.length === 0
                ? 'No providers added yet.'
                : `${openaiCompatibleProviders.length} provider${openaiCompatibleProviders.length !== 1 ? 's' : ''} configured.`}
            </p>
          </div>
          <Button
            onClick={() => setView({ mode: 'template-picker' })}
            data-testid="openai-compat-add-provider"
            className={cn(
              'gap-1.5',
              'bg-gradient-to-r from-violet-500 to-violet-600',
              'hover:from-violet-600 hover:to-violet-700',
              'text-white font-medium border-0',
              'shadow-md shadow-violet-500/20 hover:shadow-lg hover:shadow-violet-500/25',
              'transition-all duration-200 ease-out'
            )}
          >
            <Plus className="h-4 w-4" />
            Add Provider
          </Button>
        </div>

        <div className="p-4">
          {openaiCompatibleProviders.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {openaiCompatibleProviders.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  onEdit={() => setView({ mode: 'edit', provider })}
                  onDelete={() => handleDelete(provider.id)}
                  onToggle={() => toggleOpenAICompatibleProviderEnabled(provider.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default OpenAICompatibleTab;
