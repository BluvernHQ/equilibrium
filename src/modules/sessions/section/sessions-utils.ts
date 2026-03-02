/**
 * Helper functions for the Sessions module.
 */

import { masterTagColors } from './sessions-types';

export function getMasterTagColor(identifier: string): string {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    const char = identifier.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const index = Math.abs(hash) % masterTagColors.length;
  return masterTagColors[index];
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function getSpeakerName(label: string): string {
  if (label.match(/^[A-Z]$/)) {
    return `Speaker ${label.charCodeAt(0) - 64}`;
  }
  return label;
}
