import { useSyncExternalStore } from "react";

import {
  DEFAULT_SOUND_SETTINGS,
  getSoundSettings,
  subscribeSoundSettings,
  type SoundSettings,
} from "@/lib/sounds";

const SERVER_SNAPSHOT: SoundSettings = DEFAULT_SOUND_SETTINGS;
let lastKey = "";
let lastSnap: SoundSettings = SERVER_SNAPSHOT;

// نفس الـ object طول ما القيم ما اتغيرتش (useSyncExternalStore بيحتاج كده)
function snapshot(): SoundSettings {
  const s = getSoundSettings();
  const key = `${s.enabled}|${s.volume}|${s.vibrate}|${s.clicks}|${s.typing}`;
  if (key !== lastKey) {
    lastKey = key;
    lastSnap = s;
  }
  return lastSnap;
}

export function useSoundSettings(): SoundSettings {
  return useSyncExternalStore(subscribeSoundSettings, snapshot, () => SERVER_SNAPSHOT);
}
