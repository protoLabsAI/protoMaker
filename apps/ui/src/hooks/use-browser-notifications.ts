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
import type { ActionableItem } from '@protolabsai/types';

const BASE_TITLE = 'protoLabs.studio';

/**
 * Mount at app root to enable browser-level notification channels.
 */
export function useBrowserNotifications() {
  const unreadCount = useActionableItemsStore((s) => s.unreadCount);
  const browserNotificationsEnabled = useAppStore((s) => s.browserNotificationsEnabled);
  const previousUnreadRef = useRef(unreadCount);

  // A. Title badge — always active (shows unread count, not total pending)
  useEffect(() => {
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) ${BASE_TITLE}`;
    } else {
      document.title = BASE_TITLE;
    }

    return () => {
      document.title = BASE_TITLE;
    };
  }, [unreadCount]);

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
    previousUnreadRef.current = unreadCount;
  }, [unreadCount]);
}
