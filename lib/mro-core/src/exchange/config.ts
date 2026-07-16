// Exchange transport configuration, gated behind credentials the same way the
// SAP adapter is: without an MRO endpoint configured we run in "mock" mode
// (build + validate payloads locally); a configured endpoint flips to "live".
// Actual network delivery to a specific MRO API is intentionally out of scope.

export interface ExchangeConfig {
  mode: "mock" | "live";
  originator: string;
  mroProvider: string;
  contractType: string;
  endpointUrl: string | null;
}

export function resolveExchangeConfig(
  env: Record<string, string | undefined>,
): ExchangeConfig {
  const endpointUrl = env.MRO_EXCHANGE_ENDPOINT?.trim() || null;
  return {
    mode: endpointUrl ? "live" : "mock",
    originator:
      env.MRO_EXCHANGE_ORIGINATOR?.trim() || "Rolls-Royce plc (Civil Aerospace)",
    mroProvider:
      env.MRO_EXCHANGE_PROVIDER?.trim() ||
      "HAESL (Hong Kong Aero Engine Services Ltd.)",
    contractType: env.MRO_EXCHANGE_CONTRACT?.trim() || "TotalCare",
    endpointUrl,
  };
}
