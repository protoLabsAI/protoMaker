import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAppStore } from '@/store/app-store';
import { useChatSession } from '@/hooks/use-chat-session';
import { ChatOverlayContent } from '@/components/views/chat-overlay/chat-overlay-content';

function ChatPage() {
  const navigate = useNavigate();
  const currentProject = useAppStore((s) => s.currentProject);

  const chatSession = useChatSession({
    defaultModel: 'sonnet',
    projectPath: currentProject?.path,
    projectId: currentProject?.id,
  });

  const handleHide = () => {
    navigate({ to: '/' });
  };

  return (
    <div className="h-full">
      <ChatOverlayContent {...chatSession} onHide={handleHide} />
    </div>
  );
}

export const Route = createFileRoute('/chat')({
  component: ChatPage,
});
