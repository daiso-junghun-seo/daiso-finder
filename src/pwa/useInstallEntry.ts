// src/pwa/useInstallEntry.ts
// Reads the install snapshot (§B51) through useSyncExternalStore so a beforeinstallprompt that
// arrives after first paint can add the header entry without a second state system.
import { useSyncExternalStore } from 'react';
import {
  type InstallMode,
  type InstallOutcome,
  getInstallSnapshot,
  installModeOf,
  requestInstall,
  subscribeInstall,
} from './install';

export interface InstallEntry {
  readonly mode: InstallMode;
  request(): Promise<InstallOutcome>;
}

export function useInstallEntry(): InstallEntry {
  const snapshot = useSyncExternalStore(subscribeInstall, getInstallSnapshot, getInstallSnapshot);
  return { mode: installModeOf(snapshot), request: requestInstall };
}
