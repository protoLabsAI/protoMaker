import { useState, useEffect } from 'react';
import { PartyPopper } from 'lucide-react';
import { Button } from '@protolabs/ui/atoms';
import { Input } from '@protolabs/ui/atoms';
import { Label } from '@protolabs/ui/atoms';
import { Switch } from '@protolabs/ui/atoms';
import { toast } from 'sonner';
import { useUpdateProjectSettings } from '@/hooks/mutations';
import { useProjectSettings } from '@/hooks/queries';
import type { Project } from '@/lib/electron';
import type { CeremonySettings } from '@automaker/types';
import { DEFAULT_CEREMONY_SETTINGS } from '@automaker/types';

interface ProjectCeremoniesSectionProps {
  project: Project;
}

const TOGGLE_OPTIONS: Array<{
  key: keyof CeremonySettings;
  label: string;
  description: string;
}> = [
  {
    key: 'enableEpicKickoff',
    label: 'Epic Kickoffs',
    description: 'Post an announcement when a new epic starts with planned scope and complexity.',
  },
  {
    key: 'enableStandups',
    label: 'Milestone Standups',
    description: 'Post a standup announcement when a milestone begins with planned phases.',
  },
  {
    key: 'enableMilestoneUpdates',
    label: 'Milestone Retros',
    description:
      'Post a completion report when all features in a milestone are done, with cost and PR metrics.',
  },
  {
    key: 'enableEpicDelivery',
    label: 'Epic Delivery',
    description: 'Post a delivery announcement when all child features of an epic are complete.',
  },
  {
    key: 'enableProjectRetros',
    label: 'Project Retrospectives',
    description:
      'Generate an AI-powered retrospective when a project completes, with lessons learned and improvement items.',
  },
  {
    key: 'enableContentBriefs',
    label: 'Content Briefs',
    description:
      'Generate a GTM content brief on milestone completion for blog posts, tweets, and case studies.',
  },
];

export function ProjectCeremoniesSection({ project }: ProjectCeremoniesSectionProps) {
  const updateProjectSettings = useUpdateProjectSettings();
  const { data: projectSettings } = useProjectSettings(project.path);

  const [settings, setSettings] = useState<CeremonySettings>(() => DEFAULT_CEREMONY_SETTINGS);

  // Sync from server when project settings load
  useEffect(() => {
    if (projectSettings?.ceremonySettings) {
      setSettings({ ...DEFAULT_CEREMONY_SETTINGS, ...projectSettings.ceremonySettings });
    }
  }, [projectSettings?.ceremonySettings]);

  const handleToggle = (key: keyof CeremonySettings, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    updateProjectSettings.mutate(
      {
        projectPath: project.path,
        settings: { ceremonySettings: settings },
      },
      {
        onSuccess: () => {
          toast.success('Ceremony settings saved', {
            description: 'Your ceremony configuration has been updated.',
          });
        },
        onError: (error) => {
          toast.error('Failed to save settings', {
            description: error instanceof Error ? error.message : 'An unknown error occurred',
          });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <PartyPopper className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-2xl font-bold">Ceremonies</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Automated Discord announcements for project milestones, epic completions, and
          retrospectives.
        </p>
      </div>

      {/* Master Toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
        <div className="space-y-0.5 flex-1">
          <Label htmlFor="ceremonies-enabled" className="text-base font-medium">
            Enable Ceremonies
          </Label>
          <p className="text-sm text-muted-foreground">
            Turn on automated ceremony announcements for this project.
          </p>
        </div>
        <Switch
          id="ceremonies-enabled"
          checked={settings.enabled}
          onCheckedChange={(checked) => handleToggle('enabled', checked)}
        />
      </div>

      {/* Individual Ceremony Toggles */}
      {settings.enabled && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Ceremony Types
          </h3>
          {TOGGLE_OPTIONS.map((option) => (
            <div
              key={option.key}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
            >
              <div className="space-y-0.5 flex-1 pr-4">
                <Label htmlFor={`ceremony-${option.key}`} className="text-sm font-medium">
                  {option.label}
                </Label>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </div>
              <Switch
                id={`ceremony-${option.key}`}
                checked={(settings[option.key] as boolean) ?? true}
                onCheckedChange={(checked) => handleToggle(option.key, checked)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Channel Overrides */}
      {settings.enabled && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Channel Configuration
          </h3>
          <div className="space-y-2">
            <Label htmlFor="ceremony-channel">Discord Channel ID (optional)</Label>
            <Input
              id="ceremony-channel"
              placeholder="Override default project Discord channel"
              value={settings.discordChannelId || ''}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  discordChannelId: e.target.value || undefined,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Ceremonies post to this channel instead of the project default. Leave blank to use the
              project Discord channel.
            </p>
          </div>

          {settings.enableContentBriefs && (
            <div className="space-y-2">
              <Label htmlFor="content-brief-channel">Content Brief Channel ID (optional)</Label>
              <Input
                id="content-brief-channel"
                placeholder="Separate channel for GTM content briefs"
                value={settings.contentBriefChannelId || ''}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    contentBriefChannelId: e.target.value || undefined,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Content briefs post to this channel. Required for content brief generation to work.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateProjectSettings.isPending}>
          {updateProjectSettings.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      {/* Documentation */}
      <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
        <h3 className="font-medium text-sm">How Ceremonies Work</h3>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>Ceremonies fire automatically when completion cascades trigger</li>
          <li>Feature done triggers epic check, epic done triggers milestone check</li>
          <li>Milestone completed triggers project completion check</li>
          <li>
            Use <code className="px-1 py-0.5 bg-muted rounded">POST /api/ceremonies/trigger</code>{' '}
            to manually test any ceremony type
          </li>
          <li>Discord integration must be configured for announcements to post</li>
        </ul>
      </div>
    </div>
  );
}
