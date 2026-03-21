import { useState, lazy, Suspense } from 'react';
import { CircleDot, GitPullRequest } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Spinner } from '@protolabsai/ui/atoms';

const GitHubIssuesView = lazy(() =>
  import('./github-issues-view').then((m) => ({ default: m.GitHubIssuesView }))
);

const GitHubPRsView = lazy(() =>
  import('./github-prs-view').then((m) => ({ default: m.GitHubPRsView }))
);

type GitHubTab = 'issues' | 'prs';

const tabBtnClass =
  'inline-flex h-[calc(100%-1px)] items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function toggleBtnClass(active: boolean) {
  return cn(
    tabBtnClass,
    active
      ? 'bg-primary text-primary-foreground shadow-md'
      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
  );
}

export function GitHubView() {
  const [activeTab, setActiveTab] = useState<GitHubTab>('issues');

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 px-4 py-2 flex items-center gap-3">
        <div
          className="inline-flex h-8 items-center rounded-md bg-muted p-[3px] border border-border"
          role="tablist"
          aria-label="GitHub view"
        >
          <button
            role="tab"
            aria-selected={activeTab === 'issues'}
            aria-label="Issues"
            onClick={() => setActiveTab('issues')}
            className={toggleBtnClass(activeTab === 'issues')}
          >
            <CircleDot className="w-4 h-4" />
            <span className="text-xs">Issues</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'prs'}
            aria-label="Pull Requests"
            onClick={() => setActiveTab('prs')}
            className={toggleBtnClass(activeTab === 'prs')}
          >
            <GitPullRequest className="w-4 h-4" />
            <span className="text-xs">Pull Requests</span>
          </button>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center">
            <Spinner size="lg" />
          </div>
        }
      >
        {activeTab === 'issues' ? <GitHubIssuesView /> : <GitHubPRsView />}
      </Suspense>
    </div>
  );
}
