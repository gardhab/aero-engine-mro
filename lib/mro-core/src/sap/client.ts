import type { Recommendation, SapMode } from "../types.js";
import { toSapPayload, type SapNotificationPayload } from "./payload.js";

export interface SapPushResult {
  status: "success" | "failed";
  notificationNumber?: string;
  errorMessage?: string;
  mode: SapMode;
  payload: SapNotificationPayload;
}

export interface SapConfig {
  mode: SapMode;
  baseUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  notificationType: string;
}

export interface SapAdapter {
  readonly config: SapConfig;
  push(rec: Recommendation): Promise<SapPushResult>;
}

/**
 * Resolve SAP configuration from environment. When credentials are absent the
 * adapter operates in mock mode (default), so the app is fully functional
 * standalone; a real S/4HANA sandbox can be wired later by setting the vars.
 */
export function resolveSapConfig(env: NodeJS.ProcessEnv): SapConfig {
  const baseUrl = env.SAP_BASE_URL;
  const clientId = env.SAP_CLIENT_ID;
  const clientSecret = env.SAP_CLIENT_SECRET;
  const tokenUrl = env.SAP_TOKEN_URL;
  const live = Boolean(baseUrl && clientId && clientSecret && tokenUrl);
  return {
    mode: live ? "live" : "mock",
    baseUrl,
    tokenUrl,
    clientId,
    clientSecret,
    notificationType: "M2 (Maintenance Request)",
  };
}

/** Mock adapter: deterministically simulates SAP notification creation. */
export class MockSapAdapter implements SapAdapter {
  constructor(public readonly config: SapConfig) {}

  async push(rec: Recommendation): Promise<SapPushResult> {
    const payload = toSapPayload(rec);
    // Simulate SAP rejecting notifications that lack a required induction date.
    if (!rec.recommendedInductionDate) {
      return {
        status: "failed",
        errorMessage:
          "SAP validation: RequiredStartDate is mandatory for notification type M2.",
        mode: "mock",
        payload,
      };
    }
    const number = `1${hashDigits(rec.id, 8)}`;
    return {
      status: "success",
      notificationNumber: number,
      mode: "mock",
      payload,
    };
  }
}

/**
 * Live adapter: OAuth2 client-credentials against S/4HANA Cloud, then POST to
 * the Maintenance Notification OData service. Ready to point at a sandbox.
 */
export class LiveSapAdapter implements SapAdapter {
  constructor(public readonly config: SapConfig) {}

  private async token(): Promise<string> {
    const { tokenUrl, clientId, clientSecret } = this.config;
    if (!tokenUrl || !clientId || !clientSecret) {
      throw new Error("SAP live mode is not fully configured.");
    }
    const body = new URLSearchParams({ grant_type: "client_credentials" });
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`SAP token request failed: ${res.status}`);
    }
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) throw new Error("SAP token response missing token.");
    return json.access_token;
  }

  async push(rec: Recommendation): Promise<SapPushResult> {
    const payload = toSapPayload(rec);
    try {
      const token = await this.token();
      const url = `${this.config.baseUrl}/API_MAINTENANCENOTIFICATION/MaintenanceNotification`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        return {
          status: "failed",
          errorMessage: `SAP returned ${res.status}: ${text.slice(0, 300)}`,
          mode: "live",
          payload,
        };
      }
      const json = (await res.json()) as {
        d?: { MaintenanceNotification?: string };
      };
      return {
        status: "success",
        notificationNumber: json.d?.MaintenanceNotification ?? "UNKNOWN",
        mode: "live",
        payload,
      };
    } catch (err) {
      return {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        mode: "live",
        payload,
      };
    }
  }
}

export function createSapAdapter(config: SapConfig): SapAdapter {
  return config.mode === "live"
    ? new LiveSapAdapter(config)
    : new MockSapAdapter(config);
}

function hashDigits(s: string, len: number): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const digits = (h >>> 0).toString().padStart(len, "0");
  return digits.slice(0, len);
}
