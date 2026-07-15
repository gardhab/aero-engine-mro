import type { Rule } from "../types.js";

// Default ECTM diagnostic rules. Rules are data-driven and reference the domain
// model by parameter code and failure mode; thresholds are SME-editable at runtime.

export const SEED_RULES: Rule[] = [
  {
    id: "rule-egt-margin-erosion",
    name: "EGT Margin Erosion",
    description:
      "Detects sustained exhaust gas temperature margin decay, indicating HP turbine / combustor hot-section deterioration.",
    failureMode: "EGT Margin Erosion",
    parameter: "EGT_MARGIN",
    operator: "lt",
    threshold: 15,
    consecutiveCycles: 5,
    severity: 0.75,
    enabled: true,
    autoApprove: false,
    component: "HP Turbine Blade Set",
    recommendedTaskCode: "72-50-00",
    regulatoryRefs: ["EASA CS-E 515", "AMM 72-00-00", "Trent XWB SB 72-A123"],
  },
  {
    id: "rule-fan-vibration",
    name: "Fan (N1) Vibration Exceedance",
    description:
      "Detects rising fan/LP rotor vibration indicating imbalance, blade damage, or bearing wear.",
    failureMode: "Fan Rotor Imbalance",
    parameter: "N1_VIB",
    operator: "gt",
    threshold: 3.0,
    consecutiveCycles: 3,
    severity: 0.6,
    enabled: true,
    autoApprove: false,
    component: "Fan Rotor Assembly",
    recommendedTaskCode: "72-30-00",
    regulatoryRefs: ["AMM 72-30-00", "EASA AD 2023-0187"],
  },
  {
    id: "rule-oil-pressure-low",
    name: "Oil Pressure Degradation",
    description:
      "Detects declining oil pressure trend indicating oil system or bearing degradation.",
    failureMode: "Oil System Degradation",
    parameter: "OIL_PRESSURE",
    operator: "lt",
    threshold: 50,
    consecutiveCycles: 3,
    severity: 0.7,
    enabled: true,
    autoApprove: false,
    component: "Oil Pressure Pump",
    recommendedTaskCode: "79-20-00",
    regulatoryRefs: ["AMM 79-20-00", "EASA CS-E 590"],
  },
  {
    id: "rule-oil-consumption-high",
    name: "Oil Consumption Trend",
    description:
      "Detects rising oil consumption indicating seal wear or internal leakage.",
    failureMode: "Excessive Oil Consumption",
    parameter: "OIL_CONSUMPTION",
    operator: "gt",
    threshold: 0.35,
    consecutiveCycles: 4,
    severity: 0.5,
    enabled: true,
    autoApprove: true,
    component: "Bearing Chamber Seals",
    recommendedTaskCode: "79-30-00",
    regulatoryRefs: ["AMM 79-30-00"],
  },
];
