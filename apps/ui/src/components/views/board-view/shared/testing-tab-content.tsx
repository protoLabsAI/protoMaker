import { Label } from '@protolabs/ui/atoms';
import { Checkbox } from '@protolabs/ui/atoms';
import { FlaskConical } from 'lucide-react';

interface TestingTabContentProps {
  skipTests: boolean;
  onSkipTestsChange: (skipTests: boolean) => void;
  testIdPrefix?: string;
}

export function TestingTabContent({
  skipTests,
  onSkipTestsChange,
  testIdPrefix = '',
}: TestingTabContentProps) {
  const checkboxId = testIdPrefix ? `${testIdPrefix}-skip-tests` : 'skip-tests';

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Checkbox
          id={checkboxId}
          checked={!skipTests}
          onCheckedChange={(checked) => onSkipTestsChange(checked !== true)}
          data-testid={`${testIdPrefix ? testIdPrefix + '-' : ''}skip-tests-checkbox`}
        />
        <div className="flex items-center gap-2">
          <Label htmlFor={checkboxId} className="text-sm cursor-pointer">
            Enable automated testing
          </Label>
          <FlaskConical className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        When enabled, the agent will use Playwright to verify the feature works correctly before
        marking it as verified. When disabled, manual verification will be required.
      </p>
    </div>
  );
}
