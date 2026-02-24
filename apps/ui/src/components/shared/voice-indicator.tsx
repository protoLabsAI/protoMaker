import { Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVoiceActivation } from '@/hooks/use-voice-activation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabs-ai/ui/atoms';

export function VoiceIndicator() {
  const { isEnabled, isListening, isProcessing, isCommandMode, error, toggle } =
    useVoiceActivation();

  if (!isEnabled) return null;

  const getStatus = () => {
    if (error)
      return { color: 'text-red-500', bg: 'bg-red-500/10', pulse: false, label: `Error: ${error}` };
    if (isCommandMode)
      return {
        color: 'text-blue-500',
        bg: 'bg-blue-500/10',
        pulse: true,
        label: 'Listening for command...',
      };
    if (isProcessing)
      return {
        color: 'text-amber-500',
        bg: 'bg-amber-500/10',
        pulse: true,
        label: 'Transcribing...',
      };
    if (isListening)
      return { color: 'text-green-500', bg: 'bg-green-500/10', pulse: true, label: 'Listening' };
    return { color: 'text-muted-foreground', bg: 'bg-muted/30', pulse: false, label: 'Idle' };
  };

  const status = getStatus();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={toggle}
            className={cn(
              'relative flex items-center justify-center w-7 h-7 rounded-md transition-colors',
              status.bg,
              'hover:bg-accent/50'
            )}
          >
            {error ? (
              <MicOff className={cn('w-3.5 h-3.5', status.color)} />
            ) : (
              <Mic className={cn('w-3.5 h-3.5', status.color)} />
            )}
            {status.pulse && (
              <span
                className={cn('absolute inset-0 rounded-md animate-ping opacity-20', status.bg)}
              />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {status.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
