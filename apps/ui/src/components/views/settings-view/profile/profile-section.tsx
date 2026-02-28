import { useState, useEffect, useCallback } from 'react';
import { Input, Label, Textarea } from '@protolabs-ai/ui/atoms';
import { UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGlobalSettings } from '@/hooks/queries/use-settings';
import { useUpdateGlobalSettings } from '@/hooks/mutations/use-settings-mutations';
import type { UserProfile } from '@protolabs-ai/types';

function GroupHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pt-2 pb-1">
      {children}
    </h3>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

export function ProfileSection() {
  const { data: settings } = useGlobalSettings();
  const updateSettings = useUpdateGlobalSettings({ showSuccessToast: false });

  const [local, setLocal] = useState<UserProfile>({});

  // Sync server data to local state
  useEffect(() => {
    if (settings?.userProfile) {
      setLocal(settings.userProfile);
    }
  }, [settings?.userProfile]);

  const save = useCallback(
    (overrides?: Partial<UserProfile>) => {
      const toSave = overrides ? { ...local, ...overrides } : local;
      updateSettings.mutate({ userProfile: toSave });
    },
    [local, updateSettings]
  );

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/80 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm'
      )}
    >
      <div className="p-4 border-b border-border/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
            <UserCog className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">User Profile</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure your identity and brand information for agent personalization.
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Identity */}
        <div className="space-y-4">
          <GroupHeader>Identity</GroupHeader>
          <FieldRow label="Name">
            <Input
              value={local.name ?? ''}
              onChange={(e) => setLocal((p) => ({ ...p, name: e.target.value }))}
              onBlur={() => save()}
              placeholder="Your full name"
            />
          </FieldRow>
          <FieldRow label="Title">
            <Input
              value={local.title ?? ''}
              onChange={(e) => setLocal((p) => ({ ...p, title: e.target.value }))}
              onBlur={() => save()}
              placeholder="e.g. Architect, founder"
            />
          </FieldRow>
          <FieldRow label="Bio">
            <Textarea
              value={local.bio ?? ''}
              onChange={(e) => setLocal((p) => ({ ...p, bio: e.target.value }))}
              onBlur={() => save()}
              rows={3}
              placeholder="Short bio for content agents"
            />
          </FieldRow>
        </div>

        {/* Linear */}
        <div className="space-y-4">
          <GroupHeader>Linear</GroupHeader>
          <FieldRow label="Team ID">
            <Input
              className="font-mono"
              value={local.linear?.teamId ?? ''}
              onChange={(e) =>
                setLocal((p) => ({
                  ...p,
                  linear: { ...p.linear, teamId: e.target.value },
                }))
              }
              onBlur={() => save()}
              placeholder="Linear team ID"
            />
          </FieldRow>
          <FieldRow label="In-Progress State ID">
            <Input
              className="font-mono"
              value={local.linear?.inProgressStateId ?? ''}
              onChange={(e) =>
                setLocal((p) => ({
                  ...p,
                  linear: { ...p.linear, inProgressStateId: e.target.value },
                }))
              }
              onBlur={() => save()}
              placeholder="State ID for in-progress issues"
            />
          </FieldRow>
        </div>

        {/* GitHub */}
        <div className="space-y-4">
          <GroupHeader>GitHub</GroupHeader>
          <FieldRow label="Organization">
            <Input
              value={local.github?.org ?? ''}
              onChange={(e) =>
                setLocal((p) => ({
                  ...p,
                  github: { ...p.github, org: e.target.value },
                }))
              }
              onBlur={() => save()}
              placeholder="GitHub org name"
            />
          </FieldRow>
        </div>

        {/* Brand */}
        <div className="space-y-4">
          <GroupHeader>Brand</GroupHeader>
          <FieldRow label="Agency Name">
            <Input
              value={local.brand?.agencyName ?? ''}
              onChange={(e) =>
                setLocal((p) => ({
                  ...p,
                  brand: { ...p.brand, agencyName: e.target.value },
                }))
              }
              onBlur={() => save()}
              placeholder="e.g. protoLabs"
            />
          </FieldRow>
          <FieldRow label="Product Name">
            <Input
              value={local.brand?.productName ?? ''}
              onChange={(e) =>
                setLocal((p) => ({
                  ...p,
                  brand: { ...p.brand, productName: e.target.value },
                }))
              }
              onBlur={() => save()}
              placeholder="e.g. protoMaker"
            />
          </FieldRow>
          <FieldRow label="Internal Codename">
            <Input
              value={local.brand?.internalCodename ?? ''}
              onChange={(e) =>
                setLocal((p) => ({
                  ...p,
                  brand: { ...p.brand, internalCodename: e.target.value },
                }))
              }
              onBlur={() => save()}
              placeholder="e.g. Automaker"
            />
          </FieldRow>
          <FieldRow label="Domain">
            <Input
              value={local.brand?.domain ?? ''}
              onChange={(e) =>
                setLocal((p) => ({
                  ...p,
                  brand: { ...p.brand, domain: e.target.value },
                }))
              }
              onBlur={() => save()}
              placeholder="e.g. protoLabs.studio"
            />
          </FieldRow>
          <FieldRow label="Voice">
            <Textarea
              value={local.brand?.voice ?? ''}
              onChange={(e) =>
                setLocal((p) => ({
                  ...p,
                  brand: { ...p.brand, voice: e.target.value },
                }))
              }
              onBlur={() => save()}
              rows={4}
              placeholder="Brand voice guidelines for content agents"
            />
          </FieldRow>
        </div>

        {/* Infrastructure */}
        <div className="space-y-4">
          <GroupHeader>Infrastructure</GroupHeader>
          <FieldRow label="Staging Host">
            <Input
              className="font-mono"
              value={local.infra?.stagingHost ?? ''}
              onChange={(e) =>
                setLocal((p) => ({
                  ...p,
                  infra: { ...p.infra, stagingHost: e.target.value },
                }))
              }
              onBlur={() => save()}
              placeholder="e.g. 192.168.1.100"
            />
          </FieldRow>
        </div>
      </div>
    </div>
  );
}
