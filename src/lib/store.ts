// Module: lib/store — the validated `mv:*` persistence store and the pure
// state helpers frozen in legacy/src/state.ts. Owner of the mv: key names
// (lang/theme/dir/mode/recent/ai — identical strings), the MvStore contract,
// and the pure helpers: detectDir, slugify, countWords/countChars, enumOr and
// the preference defaults. Dependency-free and DOM-free: nothing here touches
// the document or holds mutable app state — the React layer owns the state
// tree and subscribes around MvStore. The legacy module's DOM halves (cached
// element refs, toast, count rendering) stay in legacy/ for the UI agents.

/** Hard cap on any document entering the app (10 MB). */
export const MAX_INPUT_BYTES = 10 * 1024 * 1024;

const SHARED_ENCODER = new TextEncoder();

/**
 * True when `text`'s UTF-8 byte length exceeds `max` — byte-exact, without
 * the full byte copy `encode()` would allocate (a real cost on a 10 MB
 * document re-checked on every preview debounce / load). A counting scan
 * that never materializes the bytes, with an early bail once the cap is
 * crossed. There is NO cheap sound fast path from the unit count: multi-byte
 * scripts (Persian letters are 2 UTF-8 bytes, CJK 3) blow the byte cap well
 * below the unit cap. Lone
 * surrogates follow TextEncoder (U+FFFD, 3 bytes); pairs count 4.
 */
export function byteLengthOver(text: string, max: number): boolean {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF) {
      bytes += 4; // surrogate pair: the low surrogate is consumed with it
      i += 1;
    } else if (c >= 0x800) bytes += 3;
    else if (c >= 0x80) bytes += 2;
    else bytes += 1;
    if (bytes > max) return true; // bail out early — no need to finish the scan
  }
  return bytes > max;
}

/** The exact encoded length (test oracle for byteLengthOver). */
export function encodedByteLength(text: string): number {
  return SHARED_ENCODER.encode(text).length;
}

/** Prefix of every key this app writes to localStorage (identical to legacy). */
export const MV_KEY_PREFIX = 'mv:';

/** The full localStorage key for a logical store key. */
export function mvKey(key: string): string {
  return MV_KEY_PREFIX + key;
}

/** Namespaced key/value persistence over a Storage (`mv:`-prefixed). */
export interface MvStore {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

/** Store bound to an explicit Storage — tests and the UI inject fakes. */
export function createMvStore(storage: Storage): MvStore {
  return {
    get<T>(key: string, fallback: T): T {
      try {
        const v = storage.getItem(mvKey(key));
        return v === null ? fallback : JSON.parse(v) as T;
      } catch {
        return fallback;
      }
    },
    set(key: string, value: unknown): void {
      try {
        if (value === null) storage.removeItem(mvKey(key));
        else storage.setItem(mvKey(key), JSON.stringify(value));
      } catch {
        /* storage full or blocked — dropping the write is the legacy behavior */
      }
    },
  };
}

function browserLocalStorage(): Storage | undefined {
  return (globalThis as { localStorage?: Storage }).localStorage;
}

/**
 * The app store over the real localStorage. Storage is resolved per call (and
 * absent-Storage calls fall back exactly like a blocked store), so merely
 * importing this module never touches the environment — node unit tests can
 * import store consumers freely and stub `localStorage` when needed.
 */
export const store: MvStore = {
  get<T>(key: string, fallback: T): T {
    try {
      const ls = browserLocalStorage();
      const v = ls ? ls.getItem(mvKey(key)) : null;
      return v === null ? fallback : JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      const ls = browserLocalStorage();
      if (!ls) return;
      if (value === null) ls.removeItem(mvKey(key));
      else ls.setItem(mvKey(key), JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
};

/* ---------------- validated preference & document types ---------------- */

export type Lang = 'fa' | 'en';
export type Theme = 'light' | 'dark';
export type ContentDir = 'auto' | 'ltr' | 'rtl';
export type PaneMode = 'editor' | 'split' | 'preview';

export interface Doc {
  name: string;
  text: string;
  url: string | null;
  baseUrl: string;
}

/* ---------------- pure helpers ---------------- */

const RTL_RANGES: readonly (readonly [number, number])[] = [
  [0x0590, 0x05FF], [0x0600, 0x06FF], [0x0700, 0x074F],
  [0x0750, 0x077F], [0xFB50, 0xFDFF], [0xFE70, 0xFEFF],
];

/** Direction of the first strong character in the text. */
export function detectDir(text: string): 'rtl' | 'ltr' {
  const strong = [...(text || '')].find((ch) => /\p{L}/u.test(ch));
  if (!strong) return 'ltr';
  const code = strong.codePointAt(0) ?? 0;
  return RTL_RANGES.some(([a, b]) => code >= a && code <= b) ? 'rtl' : 'ltr';
}

export function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^\p{L}\p{N}\-_ ]/gu, '').replace(/\s+/g, '-');
}

/** Word count over non-whitespace runs (legacy count math, unformatted). */
export function countWords(text: string): number {
  return ((text || '').trim().match(/\S+/g) || []).length;
}

/** Character count (legacy count math, unformatted). */
export function countChars(text: string): number {
  return (text || '').length;
}

/** Locale used to format counts for a UI language (legacy: fa-IR / en-US). */
export function localeForLang(lang: Lang): 'fa-IR' | 'en-US' {
  return lang === 'fa' ? 'fa-IR' : 'en-US';
}

/** Stored preferences come from JSON.parse of localStorage — only accept known values. */
export function enumOr<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
  return ((allowed as readonly unknown[]).includes(v) ? (v as T) : d);
}

/** Default UI language (legacy: fa when navigator.language starts with 'fa'). */
export function defaultLang(navigatorLanguage: string | undefined): Lang {
  return (navigatorLanguage || '').toLowerCase().startsWith('fa') ? 'fa' : 'en';
}

/** Default theme (legacy: dark when prefers-color-scheme is dark). */
export function defaultTheme(prefersDark: boolean): Theme {
  return prefersDark ? 'dark' : 'light';
}
