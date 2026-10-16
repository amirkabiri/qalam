// Module: features/ai/providerResolution — the PURE provider selection and
// mapping logic extracted from AiPanel (the panel is an 800-line component;
// this is the send-time "which backend do we talk to" decision plus the
// provider-keyed label/gating maps). No React, no DOM, no provider instances:
// every function here takes plain settings/state in and returns a plain
// verdict out, so the panel keeps only the impure wiring (toasts, the builtin
// session lifecycle, the external-provider construction + tracking ref).

import { isExternalReady } from '../../lib/ai/settings';
import type { ProviderSettings } from '../../lib/ai/types';
import type { BuiltinAvailability } from './useBuiltinAi';

/** Status label shown until the first streamed event of a run. */
export function loadingLabelFor(
  settings: ProviderSettings,
  tt: (key: string) => string,
): string {
  if (settings.provider === 'builtin') return tt('aiStartingModel');
  if (settings.provider === 'openai') return tt('aiConnectingOpenai');
  return tt('aiConnectingAnthropic');
}

/**
 * Whether a send may be attempted at all right now — the composer/send
 * gating. Builtin needs its availability machine to have landed on a usable
 * state; any external provider (the unknown-id fallback included) just needs
 * a complete configuration.
 */
export function canAttempt(
  settings: ProviderSettings,
  builtinAvailability: BuiltinAvailability,
): boolean {
  return settings.provider === 'builtin'
    ? builtinAvailability === 'available' || builtinAvailability === 'downloadable'
    : isExternalReady(settings);
}

/** Why a send was refused before any provider was constructed. */
export type ProviderRefusalReason = 'builtin-unavailable' | 'settings-incomplete';

/**
 * The send-time provider verdict: which backend to use, or why the send is
 * refused (with the toast key the panel surfaces — one source of truth for
 * every "explain instead of send" path).
 */
export type ProviderPlan =
  | { action: 'builtin' }
  | { action: 'external' }
  | { action: 'refuse'; reason: ProviderRefusalReason; toastKey: string };

/**
 * Resolves the provider SELECTION branch for the active settings: builtin
 * requires a supported platform, anything external requires a complete
 * configuration (unknown ids fall through to the external branch exactly
 * like createExternalProvider's openai fallback). Pure — the panel performs
 * the chosen action (ensureSession, createExternalProvider, toast).
 */
export function planProvider(
  settings: ProviderSettings,
  builtin: { supported: boolean },
): ProviderPlan {
  if (settings.provider === 'builtin') {
    if (!builtin.supported) {
      return {
        action: 'refuse',
        reason: 'builtin-unavailable',
        toastKey: 'aiUnavailableExplainer',
      };
    }
    return { action: 'builtin' };
  }
  if (!isExternalReady(settings)) {
    return {
      action: 'refuse',
      reason: 'settings-incomplete',
      toastKey: 'aiSettingsIncomplete',
    };
  }
  return { action: 'external' };
}
