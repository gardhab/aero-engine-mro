import type { ExchangeStatus } from "./types.js";

// Guarded state machine for the shop-visit exchange, mirroring the discipline of
// the SAP push (only certain statuses may transition). A recommendation is
// implicitly "recommended" until a TSR is dispatched (-> "sent").

export const EXCHANGE_STATUS_ORDER: ExchangeStatus[] = [
  "recommended",
  "sent",
  "accepted",
  "in_work",
  "released",
];

const TRANSITIONS: Record<ExchangeStatus, ExchangeStatus[]> = {
  recommended: ["sent"],
  sent: ["accepted", "rejected"],
  accepted: ["in_work"],
  in_work: ["released"],
  released: [],
  rejected: [],
};

// The `sent -> accepted | rejected` step is an acknowledgement-driven handshake
// and must ONLY happen via `ingestAcknowledgement` (which parses and strictly
// validates the MRO document). Manual/operational advances are limited to the
// post-acceptance shop-floor progression so an API client can never skip the
// validated handshake by advancing a "sent" exchange straight to "accepted".
const MANUAL_ADVANCE_TRANSITIONS: Record<ExchangeStatus, ExchangeStatus[]> = {
  recommended: [],
  sent: [],
  accepted: ["in_work"],
  in_work: ["released"],
  released: [],
  rejected: [],
};

/** Whether an exchange may legally move from `from` to `to` (full state graph). */
export function canTransition(from: ExchangeStatus, to: ExchangeStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Whether an exchange may be advanced from `from` to `to` through the manual
 * advance action. Excludes the `sent -> accepted/rejected` handshake, which is
 * reserved for validated acknowledgement ingestion.
 */
export function canAdvanceManually(
  from: ExchangeStatus,
  to: ExchangeStatus,
): boolean {
  return MANUAL_ADVANCE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses reachable from the given status (for UI affordances). */
export function nextStatuses(from: ExchangeStatus): ExchangeStatus[] {
  return TRANSITIONS[from] ?? [];
}

export const EXCHANGE_STATUS_LABELS: Record<ExchangeStatus, string> = {
  recommended: "Recommended",
  sent: "Sent",
  accepted: "Accepted",
  in_work: "In Work",
  released: "Released",
  rejected: "Rejected",
};
