// Module: app/whatsNew — the data layer behind the What's New dialog. It
// lists Qalam's changes from the public GitHub API: releases first (fed by
// semantic-release), falling back to recent commits when no release exists
// yet. Everything renders as text nodes (markdown is flattened, never
// injected), so release notes cannot smuggle HTML into the dialog.

import { localeForLang, type Lang } from '../lib/store';

/** One What's New row: a release (or, in fallback mode, a commit). */
export interface WhatsNewEntry {
  /** Stable React key: the tag, or the commit sha in fallback mode. */
  id: string;
  kind: 'release' | 'commit';
  title: string;
  /** Release tag (e.g. `v1.2.0`) — null for commit entries. */
  version: string | null;
  /** ISO 8601 timestamp of the publish/commit date. */
  date: string;
  url: string;
  /** Flattened note bullets — plain text only. */
  items: string[];
}

interface GhRelease {
  name: string | null;
  tag_name: string;
  published_at: string | null;
  html_url: string;
  body: string | null;
}

interface GhCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { date: string | null } };
}

export const GITHUB_API = 'https://api.github.com/repos/amirkabiri/qalam';

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) {
    throw new Error(`GitHub API ${url} → ${response.status}`);
  }
  return response.json() as Promise<T>;
}

/** Flatten release-note markdown to plain-text bullets (no links/HTML). */
export function releaseItems(body: string | null): string[] {
  if (!body) return [];
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[*+-]\s/.test(line))
    .map((line) => line
      .replace(/^[*+-]\s+/, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) → text
      .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold** → bold
      .trim());
  // Dedupe (also keeps React keys unique — bullets render as list items).
  return [...new Set(lines)];
}

function releaseEntry(release: GhRelease): WhatsNewEntry {
  return {
    id: release.tag_name,
    kind: 'release',
    title: release.name || release.tag_name,
    version: release.tag_name,
    date: release.published_at || '',
    url: release.html_url,
    items: releaseItems(release.body),
  };
}

function commitEntry(commit: GhCommit): WhatsNewEntry {
  const [subject] = commit.commit.message.split('\n', 1);
  return {
    id: commit.sha,
    kind: 'commit',
    title: subject,
    version: null,
    date: commit.commit.author.date || '',
    url: commit.html_url,
    items: [],
  };
}

/**
 * Qalam's change history, newest first: semantic-release's GitHub releases
 * when any exist, otherwise the recent commit subjects. Throws on network /
 * rate-limit failures — the dialog owns the error + retry UX.
 */
export async function fetchWhatsNew(): Promise<WhatsNewEntry[]> {
  const releases = await getJson<GhRelease[]>(`${GITHUB_API}/releases?per_page=20`);
  if (Array.isArray(releases) && releases.length > 0) {
    return releases.map(releaseEntry);
  }
  const commits = await getJson<GhCommit[]>(`${GITHUB_API}/commits?per_page=30`);
  return commits.map(commitEntry);
}

/** Locale-aware date for a list row (`medium` style: «۱۶ اکتبر ۲۰۲۶»). */
export function formatWhatsNewDate(iso: string, lang: Lang): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(localeForLang(lang), { dateStyle: 'medium' }).format(date);
}
