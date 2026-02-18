import { Button } from '@protolabs/ui/atoms';
import { CheckCircle2, Sparkles } from 'lucide-react';

interface CompleteStepProps {
  onFinish: () => void;
}

export function CompleteStep({ onFinish }: CompleteStepProps) {
  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 rounded-full bg-linear-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/30 flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-10 h-10 text-white" />
      </div>

      <div>
        <h2 className="text-3xl font-bold text-foreground mb-3">Setup Complete!</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Your development environment is configured. You&apos;re ready to start building with
          AI-powered assistance.
        </p>
      </div>

      <Button
        size="lg"
        className="bg-linear-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white"
        onClick={onFinish}
        data-testid="setup-finish-button"
      >
        <Sparkles className="w-4 h-4 mr-2" />
        Start Building
      </Button>
    </div>
  );
}
