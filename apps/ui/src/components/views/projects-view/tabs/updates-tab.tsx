import { useState } from 'react';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import { Button, Card, Textarea } from '@protolabs-ai/ui/atoms';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@protolabs-ai/ui/atoms';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { HealthIndicator } from '../components/health-indicator';
import { useGlobalSettings } from '@/hooks/queries/use-settings';
import { toast } from 'sonner';
import type { Project, ProjectHealth, ProjectStatusUpdate } from '@protolabs-ai/types';

export function UpdatesTab({ project }: { project: Project }) {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';
  const { data: globalSettings } = useGlobalSettings();
  const authorName = globalSettings?.userProfile?.name || 'User';
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [health, setHealth] = useState<ProjectHealth>('on-track');
  const [body, setBody] = useState('');

  const addUpdate = useMutation({
    mutationFn: async () => {
      const api = getHttpApiClient();
      return api.lifecycle.addStatusUpdate(projectPath, project.slug, health, body, authorName);
    },
    onSuccess: () => {
      setBody('');
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectPath, project.slug] });
      toast.success('Status update posted');
    },
    onError: () => toast.error('Failed to post update'),
  });

  const removeUpdate = useMutation({
    mutationFn: async (updateId: string) => {
      const api = getHttpApiClient();
      return api.lifecycle.removeStatusUpdate(projectPath, project.slug, updateId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectPath, project.slug] });
    },
  });

  const updates = [...(project.updates ?? [])].reverse();

  return (
    <div className="py-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Status Updates ({updates.length})
        </h3>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="h-7">
          <Plus className="w-3.5 h-3.5 mr-1" />
          Post Update
        </Button>
      </div>

      {/* Post form */}
      {showForm && (
        <Card className="p-3 space-y-3">
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1.5">
              Health Status
            </span>
            <Select value={health} onValueChange={(v) => setHealth(v as ProjectHealth)}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue>
                  <HealthIndicator health={health} size="sm" />
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(['on-track', 'at-risk', 'off-track'] as ProjectHealth[]).map((h) => (
                  <SelectItem key={h} value={h}>
                    <HealthIndicator health={h} size="sm" />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What's the current status? Any blockers or wins?"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setBody('');
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => addUpdate.mutate()}
              disabled={!body.trim() || addUpdate.isPending}
            >
              Post
            </Button>
          </div>
        </Card>
      )}

      {/* Updates timeline */}
      {updates.length === 0 && !showForm ? (
        <div className="text-center py-8">
          <MessageSquare className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No status updates yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {updates.map((update: ProjectStatusUpdate) => (
            <Card key={update.id} className="px-3 py-2.5 group">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <HealthIndicator health={update.health} size="sm" />
                  <span className="text-[10px] text-muted-foreground">{update.author}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(update.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeUpdate.mutate(update.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    aria-label="Remove status update"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap">{update.body}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
