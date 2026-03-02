import { useState } from 'react';
import { Button, Input, Label, Textarea } from '@protolabs-ai/ui/atoms';
import { useGlobalSettings } from '@/hooks/queries/use-settings';
import { useUpdateGlobalSettings } from '@/hooks/mutations/use-settings-mutations';
import type { UserProfile } from '@protolabs-ai/types';

interface UserProfileSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function UserProfileSetupStep({ onNext, onBack, onSkip }: UserProfileSetupStepProps) {
  const { data: settings } = useGlobalSettings();
  const [profile, setProfile] = useState<UserProfile>(() => settings?.userProfile ?? {});

  const { mutate: updateSettings } = useUpdateGlobalSettings({ showSuccessToast: false });

  const handleNext = () => {
    if (profile.name || profile.title || profile.bio) {
      updateSettings({ userProfile: profile });
    }
    onNext();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-gradient-to-br from-card/80 via-card/70 to-card/80 backdrop-blur-xl p-8 space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">Tell us about yourself</h2>
          <p className="text-sm text-muted-foreground">
            This helps agents personalize their output. You can always update this in Settings.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Your name</Label>
            <Input
              id="profile-name"
              placeholder="Jane Smith"
              value={profile.name ?? ''}
              onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-title">Role or title</Label>
            <Input
              id="profile-title"
              placeholder="Architect, founder"
              value={profile.title ?? ''}
              onChange={(e) => setProfile((p) => ({ ...p, title: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-bio">
              Brief bio <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="profile-bio"
              placeholder="Tell agents a bit about your background and working style…"
              rows={3}
              value={profile.bio ?? ''}
              onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
              Skip for now
            </Button>
            <Button onClick={handleNext}>Continue</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
