/**
 * Settings-native npm plugin market and configuration editor for DSH.
 *
 * The browser panel reads live Loader entries, installs selected npm plugins
 * into the shared profile module directory, and appends only explicit user
 * overrides or new Loader rows to the profile patch.
 */
import type { Context } from '@deepseek-ai/cordis';
/** Name exposed to Cordis. */
export declare const name = "market";
/** Require only the standard Web profile services, without adding host code. */
export declare const inject: string[];
/**
 * Mount the standalone configuration panel and its same-origin data route.
 * @param raw - Cordis context supplied by the market Loader entry.
 */
export declare function apply(raw: Context): void;
//# sourceMappingURL=index.d.ts.map