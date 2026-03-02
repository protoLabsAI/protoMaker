import { useState, useEffect, useCallback } from 'react';
import { Plug, Calendar, CheckCircle2, XCircle, ExternalLink, Loader2 } from 'lucide-react';
import { Button, Input, Label, Spinner } from '@protolabs-ai/ui/atoms';
import { cn } from '@/lib/utils';
import { apiPost } from '@/lib/api-fetch';
import { getServerUrlSync } from '@/lib/http-api-client';
import { useUpdateProjectSettings } from '@/hooks/mutations';
import { toast } from 'sonner';
import type { Project } from '@/lib/electron';

interface ProjectIntegrationsSectionProps {
  project: Project;
}

interface GoogleCalendarStatus {
  connected: boolean;
  email?: string;
  hasClientCredentials: boolean;
}

export function ProjectIntegrationsSection({ project }: ProjectIntegrationsSectionProps) {
  const [gcalStatus, setGcalStatus] = useState<GoogleCalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [calendarId, setCalendarId] = useState('primary');
  const updateProjectSettings = useUpdateProjectSettings();

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiPost<GoogleCalendarStatus>('/api/google-calendar/status', {
        projectPath: project.path,
      });
      setGcalStatus(data);
    } catch (err) {
      console.error('Failed to fetch Google Calendar status:', err);
      setGcalStatus({ connected: false, hasClientCredentials: false });
    } finally {
      setLoading(false);
    }
  }, [project.path]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Listen for OAuth callback completion (window regains focus after OAuth redirect)
  useEffect(() => {
    const handleFocus = () => {
      fetchStatus();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchStatus]);

  const handleConnect = () => {
    const serverUrl = getServerUrlSync();
    const authorizeUrl = `${serverUrl}/api/google-calendar/authorize?projectPath=${encodeURIComponent(project.path)}`;
    window.open(authorizeUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await apiPost('/api/google-calendar/revoke', {
        projectPath: project.path,
      });
      setGcalStatus({
        connected: false,
        hasClientCredentials: gcalStatus?.hasClientCredentials ?? false,
      });
      toast.success('Google Calendar disconnected');
    } catch (err) {
      console.error('Failed to disconnect Google Calendar:', err);
      toast.error('Failed to disconnect', {
        description: err instanceof Error ? err.message : 'An unknown error occurred',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSaveCalendarId = () => {
    updateProjectSettings.mutate(
      {
        projectPath: project.path,
        settings: {
          integrations: {
            google: { calendarId: calendarId || 'primary' },
          },
        },
      },
      {
        onSuccess: () => {
          toast.success('Calendar ID saved');
        },
        onError: (err) => {
          console.error('Failed to save calendar ID:', err);
          toast.error('Failed to save calendar ID', {
            description: err instanceof Error ? err.message : 'An unknown error occurred',
          });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div
        className={cn(
          'rounded-xl overflow-hidden',
          'border border-border/50',
          'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
          'shadow-sm shadow-black/5'
        )}
      >
        <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
              <Plug className="w-5 h-5 text-brand-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">Integrations</h2>
          </div>
          <p className="text-sm text-muted-foreground/80 ml-12">
            Connect external services to enhance your project workflow.
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Google Calendar Card */}
          <div
            className={cn(
              'rounded-lg border border-border/50 overflow-hidden',
              'bg-gradient-to-br from-card/60 to-card/40'
            )}
          >
            {/* Card Header */}
            <div className="flex items-start justify-between gap-4 p-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0 bg-red-500/10">
                  <Calendar className="w-5 h-5 text-red-500" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-sm">Google Calendar</h3>
                    {loading ? (
                      <Spinner className="h-3.5 w-3.5" />
                    ) : gcalStatus?.connected ? (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-xs text-emerald-500 font-medium">Connected</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground font-medium">
                          Not connected
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sync calendar events to view deadlines and milestones alongside your features.
                  </p>
                </div>
              </div>
            </div>

            {/* Card Body */}
            <div className="px-4 pb-4">
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Spinner className="h-5 w-5" />
                </div>
              ) : gcalStatus?.connected ? (
                <div className="space-y-4">
                  {/* Connected State */}
                  <div className="rounded-lg border border-border/50 bg-accent/20 p-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{gcalStatus.email}</p>
                        <p className="text-xs text-muted-foreground">Connected Google account</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                        className="text-destructive hover:text-destructive"
                      >
                        {disconnecting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        ) : null}
                        Disconnect
                      </Button>
                    </div>
                  </div>

                  {/* Calendar ID */}
                  <div className="space-y-2">
                    <Label htmlFor="google-calendar-id" className="text-sm">
                      Calendar ID
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="google-calendar-id"
                        value={calendarId}
                        onChange={(e) => setCalendarId(e.target.value)}
                        placeholder="primary"
                        className="flex-1 text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSaveCalendarId}
                        disabled={updateProjectSettings.isPending}
                      >
                        {updateProjectSettings.isPending ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Use &quot;primary&quot; for your main calendar, or enter a specific calendar
                      ID.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Disconnected State */}
                  {!gcalStatus?.hasClientCredentials && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Google OAuth credentials are not configured on the server. Set
                        GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI environment
                        variables.
                      </p>
                    </div>
                  )}
                  <Button
                    onClick={handleConnect}
                    disabled={!gcalStatus?.hasClientCredentials}
                    className="gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Connect Google Calendar
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
