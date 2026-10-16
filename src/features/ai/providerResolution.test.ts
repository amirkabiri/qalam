// Unit tests for src/features/ai/providerResolution.ts — the pure provider
// selection/mapping logic extracted from AiPanel. Node project (no DOM): the
// verdicts are plain functions of (settings, builtin state), so every branch
// the panel used to implement inline is pinned here without mounting the
// component — including the unknown-provider fallbacks.
import { describe, expect, it } from 'vitest';

import {
  canAttempt,
  loadingLabelFor,
  planProvider,
} from './providerResolution';
import type { ProviderSettings } from '../../lib/ai/types';

/** Translator stub: echoes the key so assertions pin the exact dictionary key. */
const tt = (key: string): string => `t:${key}`;

function settings(overrides: Partial<ProviderSettings> = {}): ProviderSettings {
  return {
    provider: 'builtin',
    baseUrl: '',
    apiKey: '',
    model: '',
    ...overrides,
  };
}

describe('loadingLabelFor', () => {
  it('builtin → the starting-model label', () => {
    expect(loadingLabelFor(settings({ provider: 'builtin' }), tt)).toBe('t:aiStartingModel');
  });

  it('openai → the connecting-openai label', () => {
    expect(loadingLabelFor(settings({ provider: 'openai' }), tt)).toBe('t:aiConnectingOpenai');
  });

  it('anthropic → the connecting-anthropic label', () => {
    expect(loadingLabelFor(settings({ provider: 'anthropic' }), tt)).toBe('t:aiConnectingAnthropic');
  });

  it('unknown provider → the anthropic label (the mapping fallback)', () => {
    const unknown = settings({ provider: 'groq' as ProviderSettings['provider'] });
    expect(loadingLabelFor(unknown, tt)).toBe('t:aiConnectingAnthropic');
  });
});

describe('canAttempt', () => {
  it('builtin: available and downloadable allow a send', () => {
    expect(canAttempt(settings(), 'available')).toBe(true);
    expect(canAttempt(settings(), 'downloadable')).toBe(true);
  });

  it('builtin: checking / downloading / unavailable block a send', () => {
    expect(canAttempt(settings(), 'checking')).toBe(false);
    expect(canAttempt(settings(), 'downloading')).toBe(false);
    expect(canAttempt(settings(), 'unavailable')).toBe(false);
  });

  it('external: complete configuration allows a send', () => {
    const ready = settings({
      provider: 'openai',
      baseUrl: 'https://gw.example.com/v1',
      model: 'gpt-x',
    });
    expect(canAttempt(ready, 'unavailable')).toBe(true);
  });

  it('external: missing baseUrl or model blocks a send', () => {
    const noUrl = settings({ provider: 'openai', model: 'gpt-x' });
    const noModel = settings({ provider: 'anthropic', baseUrl: 'https://gw.example.com' });
    expect(canAttempt(noUrl, 'available')).toBe(false);
    expect(canAttempt(noModel, 'available')).toBe(false);
  });

  it('unknown provider → the external readiness branch (the gating fallback)', () => {
    const unknownReady = settings({
      provider: 'groq' as ProviderSettings['provider'],
      baseUrl: 'https://gw.example.com',
      model: 'm',
    });
    const unknownIncomplete = settings({ provider: 'groq' as ProviderSettings['provider'] });
    expect(canAttempt(unknownReady, 'unavailable')).toBe(true);
    expect(canAttempt(unknownIncomplete, 'unavailable')).toBe(false);
  });
});

describe('planProvider', () => {
  it('builtin + supported platform → use the builtin provider', () => {
    expect(planProvider(settings(), { supported: true })).toEqual({ action: 'builtin' });
  });

  it('builtin + unsupported platform → refuse with the explainer toast', () => {
    expect(planProvider(settings(), { supported: false })).toEqual({
      action: 'refuse',
      reason: 'builtin-unavailable',
      toastKey: 'aiUnavailableExplainer',
    });
  });

  it('external + complete configuration → build the external provider', () => {
    const ready = settings({
      provider: 'openai',
      baseUrl: 'https://gw.example.com/v1',
      model: 'gpt-x',
    });
    expect(planProvider(ready, { supported: false })).toEqual({ action: 'external' });
  });

  it('external + incomplete configuration → refuse with the settings toast', () => {
    const incomplete = settings({ provider: 'anthropic', apiKey: 'sk', model: 'claude' });
    expect(planProvider(incomplete, { supported: true })).toEqual({
      action: 'refuse',
      reason: 'settings-incomplete',
      toastKey: 'aiSettingsIncomplete',
    });
  });

  it('unknown provider falls through to the external branch (never the builtin one)', () => {
    const unknown = settings({
      provider: 'groq' as ProviderSettings['provider'],
      baseUrl: 'https://gw.example.com',
      model: 'm',
    });
    expect(planProvider(unknown, { supported: true })).toEqual({ action: 'external' });

    const unknownIncomplete = settings({
      provider: 'groq' as ProviderSettings['provider'],
    });
    expect(planProvider(unknownIncomplete, { supported: true })).toEqual({
      action: 'refuse',
      reason: 'settings-incomplete',
      toastKey: 'aiSettingsIncomplete',
    });
  });
});
