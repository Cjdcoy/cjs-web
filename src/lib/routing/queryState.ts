import { useCallback, useMemo } from "react";
import { navigate, useBrowserLocation } from "./browser";

export interface QueryParamCodec<Value> {
  readonly defaultValue: Value;
  parse(value: string | null): Value;
  serialize(value: unknown): string | null;
}

export type QuerySchema = Readonly<Record<string, QueryParamCodec<unknown>>>;

export type QueryState<Schema extends QuerySchema> = {
  [Key in keyof Schema]: Schema[Key] extends QueryParamCodec<infer Value> ? Value : never;
};

export type QueryStateUpdate<Schema extends QuerySchema> =
  Partial<QueryState<Schema>> | ((current: QueryState<Schema>) => Partial<QueryState<Schema>>);

export interface QueryStateNavigationOptions {
  replace?: boolean;
}

export function defineQuerySchema<const Schema extends QuerySchema>(schema: Schema): Schema {
  return schema;
}

export function stringQueryParam(
  options: { defaultValue?: string; maxLength?: number; trim?: boolean } = {},
): QueryParamCodec<string> {
  const defaultValue = options.defaultValue ?? "";

  return {
    defaultValue,
    parse(value) {
      if (value === null) return defaultValue;
      const parsed = options.trim ? value.trim() : value;
      return options.maxLength === undefined ? parsed : parsed.slice(0, options.maxLength);
    },
    serialize(value) {
      if (typeof value !== "string") return null;
      const serialized = options.trim ? value.trim() : value;
      return serialized === defaultValue ? null : serialized;
    },
  };
}

export function enumQueryParam<const Values extends readonly string[]>(
  values: Values,
  defaultValue: Values[number],
): QueryParamCodec<Values[number]> {
  const allowedValues = new Set<string>(values);

  return {
    defaultValue,
    parse(value) {
      return value !== null && allowedValues.has(value) ? value : defaultValue;
    },
    serialize(value) {
      return typeof value === "string" && value !== defaultValue && allowedValues.has(value)
        ? value
        : null;
    },
  };
}

export function booleanQueryParam(defaultValue = false): QueryParamCodec<boolean> {
  return {
    defaultValue,
    parse(value) {
      if (value === null) return defaultValue;
      if (["1", "true", "yes"].includes(value.toLowerCase())) return true;
      if (["0", "false", "no"].includes(value.toLowerCase())) return false;
      return defaultValue;
    },
    serialize(value) {
      return typeof value === "boolean" && value !== defaultValue ? (value ? "1" : "0") : null;
    },
  };
}

export function integerQueryParam(
  options: { defaultValue?: number; min?: number; max?: number } = {},
): QueryParamCodec<number> {
  const defaultValue = options.defaultValue ?? 0;

  return {
    defaultValue,
    parse(value) {
      if (value === null || !/^-?\d+$/.test(value)) return defaultValue;
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed)) return defaultValue;
      if (options.min !== undefined && parsed < options.min) return defaultValue;
      if (options.max !== undefined && parsed > options.max) return defaultValue;
      return parsed;
    },
    serialize(value) {
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value === defaultValue) {
        return null;
      }
      if (options.min !== undefined && value < options.min) return null;
      if (options.max !== undefined && value > options.max) return null;
      return String(value);
    },
  };
}

export function readQueryState<Schema extends QuerySchema>(
  search: string,
  schema: Schema,
): QueryState<Schema> {
  const parameters = new URLSearchParams(search);
  const state = {} as QueryState<Schema>;

  for (const key of Object.keys(schema) as Array<keyof Schema>) {
    state[key] = schema[key].parse(parameters.get(String(key))) as QueryState<Schema>[typeof key];
  }

  return state;
}

export function updateQuerySearch<Schema extends QuerySchema>(
  search: string,
  schema: Schema,
  update: QueryStateUpdate<Schema>,
): string {
  const current = readQueryState(search, schema);
  const changes = typeof update === "function" ? update(current) : update;
  const next = { ...current, ...changes } as QueryState<Schema>;
  const parameters = new URLSearchParams(search);

  for (const key of Object.keys(schema) as Array<keyof Schema>) {
    const serialized = schema[key].serialize(next[key]);
    if (serialized === null) {
      parameters.delete(String(key));
    } else {
      parameters.set(String(key), serialized);
    }
  }

  const query = parameters.toString();
  return query ? `?${query}` : "";
}

export function useQueryState<Schema extends QuerySchema>(
  schema: Schema,
): readonly [
  QueryState<Schema>,
  (update: QueryStateUpdate<Schema>, options?: QueryStateNavigationOptions) => void,
] {
  const location = useBrowserLocation();
  const state = useMemo(() => readQueryState(location.search, schema), [location.search, schema]);
  const setState = useCallback(
    (update: QueryStateUpdate<Schema>, options: QueryStateNavigationOptions = {}) => {
      const search = updateQuerySearch(location.search, schema, update);
      navigate(`${location.pathname}${search}${location.hash}`, options);
    },
    [location.hash, location.pathname, location.search, schema],
  );

  return [state, setState] as const;
}
