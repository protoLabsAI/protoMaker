/**
 * Browser notifications hook — handles two notification channels:
 *
 * A. Title badge (always on): Prepends "(N)" to document.title when pending items exist.
 * B. Web Notification API (opt-in): Shows browser notifications for new actionable items
 *    when the tab is not focused. Requires `browserNotificationsEnabled` in app store.
 */

import { useEffect, useRef } from 'react';
import { useActionableItemsStore } from '@/store/actionable-items-store';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import type { ActionableItem } from '@automaker/types';

const BASE_TITLE = 'Automaker';

/**
 * Mount at app root to enable browser-level notification channels.
 */
export function useBrowserNotifications() {
  const pendingCount = useActionableItemsStore((s) => s.pendingCount);
  const browserNotificationsEnabled = useAppStore((s) => s.browserNotificationsEnabled);
  const previousPendingRef = useRef(pendingCount);

  // A. Title badge — always active
  useEffect(() => {
    if (pendingCount > 0) {
      document.title = `(${pendingCount}) ${BASE_TITLE}`;
    } else {
      document.title = BASE_TITLE;
    }

    return () => {
      document.title = BASE_TITLE;
    };
  }, [pendingCount]);

  // B. Web Notification API — opt-in
  useEffect(() => {
    if (!browserNotificationsEnabled) return;

    // Request permission if not already granted
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [browserNotificationsEnabled]);

  // Subscribe to new item events for browser notifications
  useEffect(() => {
    if (!browserNotificationsEnabled) return;
    if (Notification.permission !== 'granted') return;

    const api = getHttpApiClient();

    const unsub = api.actionableItems.onItemCreated((item: ActionableItem) => {
      // Only notify when tab is not focused
      if (document.hasFocus()) return;

      const notification = new Notification(item.title, {
        body: item.message || `New ${item.actionType} requires your attention`,
        tag: `actionable-${item.id}`,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    });

    return unsub;
  }, [browserNotificationsEnabled]);

  // Track count changes for badge logic
  useEffect(() => {
    previousPendingRef.current = pendingCount;
  }, [pendingCount]);
}
