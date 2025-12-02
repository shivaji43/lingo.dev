/**
 * Type definitions for the framework-agnostic dev widget
 */

export type WidgetPosition =
  | "bottom-left"
  | "bottom-right"
  | "top-left"
  | "top-right";

export interface LingoDevState {
  isLoading: boolean;
  locale: string;
  sourceLocale: string;
  pendingCount: number;
  position: WidgetPosition;
}

declare global {
  interface Window {
    __LINGO_DEV_STATE__?: LingoDevState;
    __LINGO_DEV_UPDATE__?: () => void;
  }
}
