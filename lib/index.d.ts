/**
 * Standalone Web configuration editor for the active DSH profile.
 *
 * It deliberately owns no marketplace behavior yet. The browser panel reads
 * the live Loader entries and appends explicit user overrides to the profile
 * patch without changing any existing line in that file.
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