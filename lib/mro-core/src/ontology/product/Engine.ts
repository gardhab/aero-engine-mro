import type { PhysicalAsset } from "../operations/Equipment.js";
import type { TimeInterval } from "../common/BaseModel.js";

/**
 * Engine — a serialized gas-turbine aero engine extending ISA-95 PhysicalAsset.
 * Identified by ESN (engine serial number). The aircraft tail number belongs to
 * Aircraft, linked through EngineInstallation.
 */
export interface ISA95Engine extends PhysicalAsset {
  readonly _type: "Engine";
  /** Engine serial number — the primary identity key */
  esn: string;
  /** ID of the EngineModel (PhysicalAssetClass) this engine conforms to */
  engineModelId: string;
  /** Time since new (flight hours) */
  tsn: number;
  /** Cycles since new */
  csn: number;
  /** Time since overhaul (hours) */
  tso?: number;
  /** Cycles since overhaul */
  cso?: number;
  /** Fleet-management status */
  status: "operational" | "monitor" | "action_required" | "grounded";
  /**
   * ISA-95 location: ID of WorkCenter or WorkUnit where the engine sits
   * while twinState = IN_WORK. Null when in service.
   */
  currentLocationId?: string;
  /** IDs of EngineModule PhysicalAsset twins installed on this engine */
  moduleIds: string[];
  installationHistory: EngineInstallation[];
}

export interface EngineInstallation {
  aircraftId: string;
  position: "1" | "2" | "3" | "4" | "LEFT" | "RIGHT" | "CENTER" | "APU";
  interval: TimeInterval;
}

/**
 * EngineModule — a serialized major module (fan, compressor, turbine…)
 * extending ISA-95 PhysicalAsset.
 */
export interface ISA95EngineModule extends PhysicalAsset {
  readonly _type: "EngineModule";
  /** Parent engine ESN */
  engineId: string;
  /** Module position: Fan, LPC, HPC, Combustor, HPT, LPT, etc. */
  modulePosition: string;
  tsn: number;
  csn: number;
  tso?: number;
  cso?: number;
  status: "normal" | "caution" | "warning";
  /** IDs of Component PhysicalAsset twins within this module */
  componentIds: string[];
}
