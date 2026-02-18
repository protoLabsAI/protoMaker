import { Label } from '@protolabs/ui/atoms';
import { Checkbox } from '@protolabs/ui/atoms';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioSectionProps {
  muteDoneSound: boolean;
  onMuteDoneSoundChange: (value: boolean) => void;
}

export function AudioSection({ muteDoneSound, onMuteDoneSoundChange }: AudioSectionProps) {
  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-4 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <Volume2 className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Audio</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Configure audio and notification settings.
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="mute-done-sound"
            checked={muteDoneSound}
            onCheckedChange={onMuteDoneSoundChange}
            className="mt-1"
            data-testid="mute-done-sound-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="mute-done-sound"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <VolumeX className="w-4 h-4 text-brand-500" />
              Mute notification sound when agents complete
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, disables the &quot;ding&quot; sound that plays when an agent completes a
              feature. The feature will still move to the completed column, but without audio
              notification.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
