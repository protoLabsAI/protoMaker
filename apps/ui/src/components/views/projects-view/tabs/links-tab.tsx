import { useState } from 'react';
import { Plus, Trash2, ExternalLink, Link as LinkIcon } from 'lucide-react';
import { Button } from '@protolabs-ai/ui/atoms';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Project, ProjectLink } from '@protolabs-ai/types';

export function LinksTab({ project }: { project: Project }) {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');

  const addLink = useMutation({
    mutationFn: async () => {
      const api = getHttpApiClient();
      return api.lifecycle.addLink(projectPath, project.slug, label, url);
    },
    onSuccess: () => {
      setLabel('');
      setUrl('');
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectPath, project.slug] });
      toast.success('Link added');
    },
    onError: () => toast.error('Failed to add link'),
  });

  const removeLink = useMutation({
    mutationFn: async (linkId: string) => {
      const api = getHttpApiClient();
      return api.lifecycle.removeLink(projectPath, project.slug, linkId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectPath, project.slug] });
      toast.success('Link removed');
    },
  });

  const links = project.links ?? [];

  return (
    <div className="py-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          External Links ({links.length})
        </h3>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="h-7">
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Link
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="border border-border/30 rounded-lg p-3 space-y-2 bg-muted/10">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label..."
            className={cn(
              'w-full px-2.5 py-1.5 rounded text-sm',
              'bg-background border border-border/50',
              'text-foreground placeholder:text-muted-foreground/50',
              'focus:outline-none focus:ring-1 focus:ring-violet-500/30'
            )}
            autoFocus
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className={cn(
              'w-full px-2.5 py-1.5 rounded text-sm',
              'bg-background border border-border/50',
              'text-foreground placeholder:text-muted-foreground/50',
              'focus:outline-none focus:ring-1 focus:ring-violet-500/30'
            )}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setLabel('');
                setUrl('');
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => addLink.mutate()}
              disabled={!label.trim() || !url.trim() || addLink.isPending}
            >
              Add
            </Button>
          </div>
        </div>
      )}

      {/* Links list */}
      {links.length === 0 && !showForm ? (
        <div className="text-center py-8">
          <LinkIcon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No links yet.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {links.map((link: ProjectLink) => (
            <div
              key={link.id}
              className="flex items-center gap-2 border border-border/20 rounded-lg px-3 py-2 group"
            >
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-foreground block truncate">{link.label}</span>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-blue-400 hover:text-blue-300 truncate block"
                >
                  {link.url}
                </a>
              </div>
              <button
                type="button"
                onClick={() => removeLink.mutate(link.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-opacity"
                aria-label={`Remove ${link.label}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
