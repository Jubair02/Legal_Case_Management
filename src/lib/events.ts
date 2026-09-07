/**
 * Shared window-event names for cross-component signalling inside the SPA.
 * Dispatch with `window.dispatchEvent(new Event(<name>))`.
 */

/** Fired when notification read-state changes outside the bell dropdown —
 *  the header badge listens and re-polls its unread count. */
export const NOTIFICATIONS_CHANGED_EVENT = "lcm:notifications-changed"
