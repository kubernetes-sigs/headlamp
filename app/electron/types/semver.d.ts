declare module 'semver' {
  export function valid(version: string): string | null;
  export function satisfies(version: string, range: string): boolean;
  export function gt(v1: string, v2: string): boolean;
  export function lt(v1: string, v2: string): boolean;
  export function clean(version: string): string | null;
  export function coerce(version: string): { version: string } | null;
  export function parse(version: string): { major: number; minor: number; patch: number } | null;
}