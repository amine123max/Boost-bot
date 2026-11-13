/**
 * state.schema.json 用到的 JSON Schema 子集：type、properties、required、additionalProperties、items、enum、const、
 * minimum / maximum、minLength / maxLength、minItems / maxItems。
 * 模型不一定每次都照约定写，所以除了校验还有 prune：把不合法的部分剪掉，界面能渲染多少渲染多少。
 */
export type JsonSchema = Record<string, any>;

const typeOf = (v: unknown): string => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
function typeMatches(v: unknown, t: string): boolean {
  const got = typeOf(v);
  return got === t || (t === "number" && got === "integer");
}

const KNOWN = new Set(["$schema", "$id", "title", "description", "default", "examples", "type", "properties", "required", "additionalProperties", "items", "enum", "const", "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]);

/** 约束检查用：Schema 里用了这个子集以外的关键字就报出来，免得作者以为它生效了 */
export function unsupportedKeywords(schema: unknown, at = "#"): string[] {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [`${at} 不是对象`];
  const s = schema as JsonSchema;
  const out: string[] = [];
  for (const k of Object.keys(s)) if (!KNOWN.has(k)) out.push(`${at}/${k}`);
  for (const [k, sub] of Object.entries(s.properties ?? {})) out.push(...unsupportedKeywords(sub, `${at}/properties/${k}`));
  if (s.items) out.push(...unsupportedKeywords(s.items, `${at}/items`));
  if (s.additionalProperties && typeof s.additionalProperties === "object") out.push(...unsupportedKeywords(s.additionalProperties, `${at}/additionalProperties`));
  return out;
}

export function validate(value: unknown, schema: JsonSchema, at = "$"): string[] {
  const errs: string[] = [];
  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) errs.push(`${at} 应该等于 ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) errs.push(`${at} 不在允许的取值里`);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t: string) => typeMatches(value, t))) {
      errs.push(`${at} 应该是 ${types.join(" 或 ")}`);
      return errs;
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${at} 不能小于 ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${at} 不能大于 ${schema.maximum}`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errs.push(`${at} 太短`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errs.push(`${at} 太长`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errs.push(`${at} 至少 ${schema.minItems} 项`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errs.push(`${at} 最多 ${schema.maxItems} 项`);
    if (schema.items) value.forEach((v, i) => errs.push(...validate(v, schema.items, `${at}[${i}]`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    for (const k of schema.required ?? []) if (o[k] === undefined) errs.push(`${at}.${k} 缺失`);
    const props = schema.properties ?? {};
    for (const [k, v] of Object.entries(o)) {
      if (props[k]) errs.push(...validate(v, props[k], `${at}.${k}`));
      else if (schema.additionalProperties === false) errs.push(`${at}.${k} 不在约定里`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") errs.push(...validate(v, schema.additionalProperties, `${at}.${k}`));
    }
  }
  return errs;
}

/**
 * 剪掉不合法的部分：对象里不合法的字段去掉，数组里不合法的项去掉；整个值都不合法时返回 undefined。
 * 顶层对象缺必填字段不算致命，界面按“能渲染多少渲染多少”处理。
 */
export function prune(value: unknown, schema: JsonSchema): unknown {
  if (value && typeof value === "object" && !Array.isArray(value) && (!schema.type || [schema.type].flat().includes("object"))) {
    const props = schema.properties ?? {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) {
        const p = prune(v, props[k]);
        if (p !== undefined) out[k] = p;
      } else if (schema.additionalProperties === false) continue;
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        const p = prune(v, schema.additionalProperties);
        if (p !== undefined) out[k] = p;
      } else out[k] = v;
    }
    return out;
  }
  if (Array.isArray(value) && (!schema.type || [schema.type].flat().includes("array"))) {
    // 列表里的一项缺了必填字段就没法显示，整项去掉；对象本身缺字段时留着，能显示多少显示多少
    const items = schema.items ? value.map((v) => prune(v, schema.items)).filter((v) => v !== undefined && !validate(v, schema.items).length) : value;
    return validate(items, { ...schema, items: undefined, minItems: undefined }).length ? undefined : items;
  }
  return validate(value, schema).length ? undefined : value;
}
