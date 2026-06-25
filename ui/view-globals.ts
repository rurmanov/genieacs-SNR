import {
  Signal,
  setTimeout as wrappedSetTimeout,
  setInterval as wrappedSetInterval,
} from "./signals.ts";
import { ViewNode } from "./views.ts";
import { SkewedDate } from "./skewed-date.ts";

// The view JSX factory.
function h(
  name: string,
  attributes: Record<string, any> | null,
  ...children: any[]
): ViewNode {
  return new ViewNode(name, attributes, children.flat());
}

// Exposes only the safe members of window; everything else resolves to undefined.
const windowFacade = Object.freeze({
  prompt: window.prompt.bind(window),
  confirm: window.confirm.bind(window),
});

// The frozen allowlist each view body destructures its free identifiers from; a
// bare reference to any name not listed here fails closed to undefined.
//
// This is a guardrail, not a security sandbox: it keeps view authors from
// accidentally reaching for host globals (document, fetch, …), but it cannot
// contain hostile code — e.g. Object.constructor.constructor still yields
// Function, and from there the real global scope. Views are trusted,
// admin-authored config; do not rely on this allowlist as an isolation boundary.
export const viewGlobals = Object.freeze({
  h,
  Signal,

  // wrapped timers auto-clear on owner disposal/recompute; clear* pair with them
  setTimeout: wrappedSetTimeout,
  setInterval: wrappedSetInterval,
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),

  // value globals
  Math,
  Object,
  String,
  Boolean,
  Number,
  Array,
  Map,
  Set,
  RegExp,
  Error,
  JSON,
  URL,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  decodeURIComponent,
  encodeURIComponent,
  Date: SkewedDate, // server-skew-adjusted clock

  // host bridges
  prompt: window.prompt.bind(window),
  confirm: window.confirm.bind(window),
  window: windowFacade,
});
