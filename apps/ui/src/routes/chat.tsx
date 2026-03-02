import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAppStore } from '@/store/app-store';
import { useChatSession } from '@/hooks/use-chat-session';
import { ChatOverlayContent } from '@/components/views/chat-overlay/chat-overlay-content';

function ChatPage() {
  const navigate = useNavigate();
  const currentProject = useAppStore((s) => s.currentProject);
  const avaChat = useAppStore((s) => s.featureFlags.avaChat);

  const chatSession = useChatSession({
    defaultModel: 'sonnet',
    projectPath: currentProject?.path,
    projectId: currentProject?.id,
  });

  const handleHide = () => {
    navigate({ to: '/' });
  };

  if (!avaChat) {
    navigate({ to: '/' });
    return null;
  }

  return (
    <div className="h-full">
      <ChatOverlayContent {...chatSession} onHide={handleHide} />
    </div>
  );
}

export const Route = createFileRoute('/chat')({
  component: ChatPage,
});
