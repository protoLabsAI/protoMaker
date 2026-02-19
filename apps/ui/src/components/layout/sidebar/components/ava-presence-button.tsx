import { MessageSquare, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useVoiceActivation } from '@/hooks/use-voice-activation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabs/ui/atoms';

interface AvaPresenceButtonProps {
  sidebarOpen: boolean;
}

export function AvaPresenceButton({ sidebarOpen }: AvaPresenceButtonProps) {
  const toggleChatSidebar = useAppStore((s) => s.toggleChatSidebar);
  const chatSidebarOpen = useAppStore((s) => s.chatSidebarOpen);
  const {
    isEnabled: voiceEnabled,
    isListening,
    isProcessing,
    isCommandMode,
    error: voiceError,
  } = useVoiceActivation();

  // Voice status indicator color
  const getVoiceRing = () => {
    if (!voiceEnabled) return null;
    if (voiceError) return 'ring-red-500/60';
    if (isCommandMode) return 'ring-blue-500/60 animate-pulse';
    if (isProcessing) return 'ring-amber-500/60 animate-pulse';
    if (isListening) return 'ring-green-500/60 animate-pulse';
    return 'ring-muted-foreground/20';
  };

  const voiceRing = getVoiceRing();

  return (
    <div
      className={cn('shrink-0 border-t border-border/40', sidebarOpen ? 'px-4 py-3' : 'px-2 py-3')}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleChatSidebar}
              className={cn(
                'flex items-center gap-3 w-full rounded-xl transition-all duration-200',
                sidebarOpen ? 'px-3 py-2.5' : 'justify-center p-2.5',
                chatSidebarOpen
                  ? 'bg-brand-500/15 text-brand-500'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                voiceRing && `ring-2 ${voiceRing}`
              )}
              data-testid="ava-presence-button"
            >
              <div className="relative flex items-center justify-center">
                <MessageSquare className={cn('size-5', chatSidebarOpen && 'text-brand-500')} />
                {voiceEnabled && (
                  <Mic className="absolute -bottom-1 -right-1 size-2.5 text-green-500" />
                )}
              </div>
              {sidebarOpen && (
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-sm font-medium truncate">Ava</span>
                  {voiceEnabled && (
                    <span className="text-[10px] text-muted-foreground leading-tight">
                      {isCommandMode
                        ? 'Command mode'
                        : isProcessing
                          ? 'Transcribing'
                          : isListening
                            ? 'Listening'
                            : 'Voice active'}
                    </span>
                  )}
                </div>
              )}
            </button>
          </TooltipTrigger>
          {!sidebarOpen && (
            <TooltipContent side="right" className="text-xs">
              {chatSidebarOpen ? 'Close chat' : 'Chat with Ava'}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
