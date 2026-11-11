/** Structural validation for raw catalogs. Never pass a fallback-merged catalog here. */
const categories = new Set(["zero", "one", "two", "few", "many", "other"]);
export const isPlural = (v) => !!v && typeof v === "object" && !Array.isArray(v)
  && typeof v.other === "string" && Object.keys(v).every((k) => categories.has(k));
export function leaves(value, prefix = "", out = {}) {
  if (typeof value === "string" || isPlural(value)) out[prefix] = value;
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) leaves(v, prefix ? `${prefix}.${k}` : k, out);
  } else out[prefix] = value;
  return out;
}
const variables = (value) => [...new Set((typeof value === "string" ? [value] : Object.values(value))
  .flatMap((s) => [...String(s).matchAll(/\{([\w.]+)\}/g)].map((m) => m[1])))].sort().join(",");
export function inspectLocale(source, translated, locale, { unchanged = {} } = {}) {
  const expected = leaves(source), actual = leaves(translated), errors = [];
  let completed = 0;
  for (const [key, original] of Object.entries(expected)) {
    const value = actual[key];
    if (value === undefined) { errors.push({ key, reason: "missing" }); continue; }
    if (typeof value !== "string" && !isPlural(value)) { errors.push({ key, reason: "invalid message" }); continue; }
    if (isPlural(original) !== isPlural(value)) { errors.push({ key, reason: "message/plural type mismatch" }); continue; }
    const values = typeof value === "string" ? [value] : Object.values(value);
    if (original !== "" && values.some((s) => typeof s !== "string" || !s.trim())) { errors.push({ key, reason: "empty" }); continue; }
    if (variables(original) !== variables(value)) { errors.push({ key, reason: "placeholder mismatch" }); continue; }
    // Detect untranslated prose without rejecting shared brands, IDs or code samples.
    if (typeof value === "string" && value === original && !(unchanged[key]?.value === value && unchanged[key]?.reason) && value.length > 18
      && /[A-Za-z]{3,}\s+[a-z]{3,}/.test(value) && !/[`{}<>]|https?:\/\//.test(value)) {
      errors.push({ key, reason: "unchanged source prose" }); continue;
    }
    if (isPlural(value)) {
      const missing = new Intl.PluralRules(locale).resolvedOptions().pluralCategories.filter((c) => !value[c]);
      if (missing.length) { errors.push({ key, reason: `missing plural forms: ${missing.join(", ")}` }); continue; }
      if (Object.values(value).some((branch) => variables(branch) !== variables(original))) {
        errors.push({ key, reason: "placeholder mismatch in plural branch" }); continue;
      }
    }
    completed++;
  }
  for (const key of Object.keys(actual)) if (!(key in expected)) errors.push({ key, reason: "extra key" });
  return { total: Object.keys(expected).length, completed, errors };
}
