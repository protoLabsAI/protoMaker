import { useAppStore, type Feature } from '@/store/app-store';
import { useIsMobile } from '@/hooks/use-media-query';
import { useRunningAgentsCount } from '@/hooks/queries/use-running-agents';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@protolabs-ai/ui/atoms';
import {
  Bot,
  ListTodo,
  Activity,
  GitPullRequest,
  History,
  BarChart3,
  MonitorCog,
  LineChart,
  Radio,
  PanelBottomOpen,
  X,
} from 'lucide-react';
import { ActivityTab } from './activity-tab';
import { StatsTab } from './stats-tab';
import { SystemTab } from './system-tab';
import { ChartsTab } from './charts-tab';
import { EventsTab } from './events-tab';

const EXPANDED_HEIGHT = 280;

export function BottomPanel() {
  const isMobile = useIsMobile();
  const bottomPanelOpen = useAppStore((s) => s.bottomPanelOpen);
  const bottomPanelActiveTab = useAppStore((s) => s.bottomPanelActiveTab);
  const toggleBottomPanel = useAppStore((s) => s.toggleBottomPanel);
  const setBottomPanelActiveTab = useAppStore((s) => s.setBottomPanelActiveTab);
  const features = useAppStore((s) => s.features);
  const { data: agentCount } = useRunningAgentsCount();

  if (isMobile) return null;

  const backlog = features.filter((f: Feature) => (f.status as string) === 'backlog').length;
  const inProgress = features.filter(
    (f: Feature) => (f.status as string) === 'in_progress' || (f.status as string) === 'running'
  ).length;
  const review = features.filter((f: Feature) => (f.status as string) === 'review').length;

  const tabTriggerClass =
    'h-7 rounded-none border-b-2 border-transparent px-2.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none';

  return (
    <>
      {/* Expanded panel */}
      {bottomPanelOpen && (
        <div
          className="border-t border-border bg-card/95 backdrop-blur overflow-hidden"
          style={{ height: EXPANDED_HEIGHT }}
        >
          <Tabs
            value={bottomPanelActiveTab}
            onValueChange={setBottomPanelActiveTab}
            className="h-full flex flex-col gap-0"
          >
            <div className="flex items-center border-b border-border/50 px-3 shrink-0">
              <TabsList className="h-7 border-0 bg-transparent p-0 gap-0 flex-1">
                <TabsTrigger value="activity" className={tabTriggerClass}>
                  <History className="h-3.5 w-3.5" />
                  Activity
                </TabsTrigger>
                <TabsTrigger value="stats" className={tabTriggerClass}>
                  <BarChart3 className="h-3.5 w-3.5" />
                  Stats
                </TabsTrigger>
                <TabsTrigger value="charts" className={tabTriggerClass}>
                  <LineChart className="h-3.5 w-3.5" />
                  Charts
                </TabsTrigger>
                <TabsTrigger value="events" className={tabTriggerClass}>
                  <Radio className="h-3.5 w-3.5" />
                  Events
                </TabsTrigger>
                <TabsTrigger value="system" className={tabTriggerClass}>
                  <MonitorCog className="h-3.5 w-3.5" />
                  System
                </TabsTrigger>
              </TabsList>
              <button
                onClick={toggleBottomPanel}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors ml-2"
                title="Close panel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <TabsContent value="activity" className="flex-1 overflow-hidden mt-0">
              <ActivityTab />
            </TabsContent>
            <TabsContent value="stats" className="flex-1 overflow-hidden mt-0">
              <StatsTab />
            </TabsContent>
            <TabsContent value="charts" className="flex-1 overflow-hidden mt-0">
              <ChartsTab />
            </TabsContent>
            <TabsContent value="events" className="flex-1 overflow-hidden mt-0">
              <EventsTab />
            </TabsContent>
            <TabsContent value="system" className="flex-1 overflow-hidden mt-0">
              <SystemTab />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Ticker bar (always visible) */}
      <div
        role="button"
        tabIndex={0}
        onClick={toggleBottomPanel}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleBottomPanel();
          }
        }}
        className="h-8 border-t border-border bg-card/80 backdrop-blur flex items-center px-3 gap-4 cursor-pointer hover:bg-muted/50 transition-colors select-none shrink-0"
      >
        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Bot className="h-3.5 w-3.5" />
            <span className={agentCount > 0 ? 'text-blue-500 font-medium' : ''}>{agentCount}</span>
          </span>
          <span className="flex items-center gap-1">
            <ListTodo className="h-3.5 w-3.5" />
            <span>{backlog}</span>
          </span>
          <span className="flex items-center gap-1">
            <Activity className="h-3.5 w-3.5" />
            <span className={inProgress > 0 ? 'text-green-500 font-medium' : ''}>{inProgress}</span>
          </span>
          <span className="flex items-center gap-1">
            <GitPullRequest className="h-3.5 w-3.5" />
            <span>{review}</span>
          </span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Panel toggle */}
        <PanelBottomOpen
          className={`h-3.5 w-3.5 ${bottomPanelOpen ? 'text-foreground' : 'text-muted-foreground'}`}
        />
      </div>
    </>
  );
}
