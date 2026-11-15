import { LANGS, setLang, setTheme, t, THEMES, useLang, useTheme } from "../i18n";

/** Language and colour theme of the interface. The choice is kept in this browser. Text and pressed state, never colour alone. */
export function Prefs() {
  const lang = useLang();
  const theme = useTheme();
  return (
    <span className="prefs noprint" role="group" aria-label={t("Interface preferences")}>
      <span className="prefs-set" role="group" aria-label={t("Language")}>
        {LANGS.map((l) => (
          <button key={l.id} type="button" lang={l.id} title={l.name} aria-pressed={lang === l.id} onClick={() => setLang(l.id)}>
            {l.short}
          </button>
        ))}
      </span>
      <span className="prefs-set" role="group" aria-label={t("Theme")}>
        {THEMES.map((th) => (
          <button key={th} type="button" title={th === "light" ? t("Light theme") : t("Dark theme")} aria-pressed={theme === th} onClick={() => setTheme(th)}>
            {th === "light" ? t("Light") : t("Dark")}
          </button>
        ))}
      </span>
    </span>
  );
}
