// Interface language and colour theme. English is the source language: the English sentence is the key,
// and a language without an entry for it falls back to English. No vocabulary of a corpus lives here;
// the texts of a corpus are translated by the locale file that ships next to its pack (see localize.ts).
import { useSyncExternalStore } from "react";
import { loadJson, saveJson } from "../report/storage";
import { ES } from "./es";

export type Lang = "en" | "es";
export type Theme = "dark" | "light";
export type Gender = "m" | "f";

export const LANGS: { id: Lang; short: string; name: string }[] = [
  { id: "en", short: "EN", name: "English" },
  { id: "es", short: "ES", name: "Español" },
];
export const THEMES: Theme[] = ["light", "dark"];

const DICT: Record<Lang, Record<string, string> | null> = { en: null, es: ES };

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

let lang: Lang = pick(loadJson<unknown>("lang", null), ["en", "es"], "en");
let theme: Theme = pick(loadJson<unknown>("theme", null), ["dark", "light"], "dark");
/** Grammatical gender of the unit of study in the current language; set from the locale file of the corpus. */
let unitGender: Gender = "m";

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = () => listeners.forEach((fn) => fn());

function apply(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.lang = lang;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#212120" : "#FFFFFF");
}
apply();

export const getLang = (): Lang => lang;
export const getTheme = (): Theme => theme;

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  saveJson("lang", lang);
  apply();
  emit();
}

export function setTheme(next: Theme): void {
  if (next === theme) return;
  theme = next;
  saveJson("theme", theme);
  apply();
  emit();
}

export function setUnitGender(g: Gender): void {
  unitGender = g;
}

/** Re-renders the caller when the language changes. Used once, at the root: everything below re-renders with it. */
export const useLang = (): Lang => useSyncExternalStore(subscribe, getLang, getLang);
export const useTheme = (): Theme => useSyncExternalStore(subscribe, getTheme, getTheme);

/**
 * Translates an English sentence. `{0}`, `{1}`… are replaced by the arguments.
 * A translation may hold `{masculine|feminine}` where the wording depends on the gender of the unit of study.
 */
export function t(en: string, ...args: (string | number | null | undefined)[]): string {
  let out = DICT[lang]?.[en] ?? en;
  if (lang !== "en" && out.includes("|")) out = out.replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_, m: string, f: string) => (unitGender === "f" ? f : m));
  return args.length ? out.replace(/\{(\d+)\}/g, (_, i: string) => String(args[Number(i)] ?? "")) : out;
}

/** Marks a sentence kept in a table outside a component. The table is wrapped in lazy(), which translates it when it is read. */
const MARKED = new Set<string>();
export const tx = (en: string): string => {
  MARKED.add(en);
  return en;
};

const views = new WeakMap<object, object>();
const isTable = (v: unknown): v is object => Array.isArray(v) || (typeof v === "object" && v !== null && Object.getPrototypeOf(v) === Object.prototype);

/**
 * A view of a table of sentences that reads in the current language. Only the strings marked with tx() are translated,
 * so identifiers kept in the same table are returned as written. In English the view returns the table unchanged.
 */
export function lazy<T extends object>(table: T): T {
  const seen = views.get(table);
  if (seen) return seen as T;
  const view = new Proxy(table, {
    get(target, key, receiver) {
      const v = Reflect.get(target, key, receiver) as unknown;
      if (typeof v === "string") return MARKED.has(v) ? t(v) : v;
      return isTable(v) ? lazy(v) : v;
    },
  });
  views.set(table, view);
  return view;
}

/** Plural of a noun in the current language: "study" -> "studies" is not attempted in English, only the regular "s". */
export function many(word: string): string {
  if (lang !== "es") return word + "s";
  if (/[áéíóú]n$/i.test(word)) return word.slice(0, -2) + { á: "a", é: "e", í: "i", ó: "o", ú: "u" }[word.slice(-2, -1).toLowerCase() as "á"]! + "nes";
  if (/z$/i.test(word)) return word.slice(0, -1) + "ces";
  if (/[aeiouáéó]$/i.test(word)) return word + "s";
  if (/s$/i.test(word)) return word;
  return word + "es";
}

/** "1 test" / "12 tests". In another language the noun is looked up as a whole ("campaign rows"), then falls back to many(). */
export function count(n: number, one: string, plural = one + "s"): string {
  const number = n.toLocaleString("en-US");
  if (lang === "en") return `${number} ${n === 1 ? one : plural}`;
  const single = t(one);
  const dict = DICT[lang]?.[plural];
  return `${number} ${n === 1 ? single : (dict ?? many(single))}`;
}
