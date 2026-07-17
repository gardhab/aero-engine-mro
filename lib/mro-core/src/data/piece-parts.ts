// Illustrative piece-part breakdowns for representative components.
//
// Completes the standard aero-engine physical hierarchy:
//   Engine → Module → Component → Piece-Part
//
// Piece parts are the lowest-level detail parts (bolts, seals, lockplates,
// spacers) that make up a serviceable component. The catalog below is keyed
// by the parent component's part number (see LLP_CATALOG — life-limited parts
// are the Component instances tracked per engine) and is deliberately
// illustrative, not certified type-design data.

export interface PiecePartDef {
  /** Parent component part number (matches LLP_CATALOG partNumber). */
  parentPartNumber: string;
  /** Piece-part name. */
  name: string;
  /** Illustrative piece-part number. */
  partNumber: string;
  /** Quantity per parent component assembly. */
  quantity: number;
}

export const PIECE_PART_CATALOG: PiecePartDef[] = [
  // Fan Disk (FW61001)
  { parentPartNumber: "FW61001", name: "Blade Retention Pin", partNumber: "FW61001-P01", quantity: 22 },
  { parentPartNumber: "FW61001", name: "Annulus Filler", partNumber: "FW61001-P02", quantity: 22 },
  { parentPartNumber: "FW61001", name: "Balance Weight Set", partNumber: "FW61001-P03", quantity: 1 },

  // IPC Stage 3-8 Drum (FW62138)
  { parentPartNumber: "FW62138", name: "Stage Spacer Ring", partNumber: "FW62138-P01", quantity: 5 },
  { parentPartNumber: "FW62138", name: "Drum Tie Bolt", partNumber: "FW62138-P02", quantity: 36 },
  { parentPartNumber: "FW62138", name: "Interstage Air Seal", partNumber: "FW62138-P03", quantity: 5 },

  // HPC Stage 1 Blisk (FW63101)
  { parentPartNumber: "FW63101", name: "Curvic Coupling Bolt", partNumber: "FW63101-P01", quantity: 24 },
  { parentPartNumber: "FW63101", name: "Front Air Seal Ring", partNumber: "FW63101-P02", quantity: 1 },

  // HPT Disk (FW71828)
  { parentPartNumber: "FW71828", name: "Blade Retention Lockplate", partNumber: "FW71828-P01", quantity: 68 },
  { parentPartNumber: "FW71828", name: "Cover Plate Bolt", partNumber: "FW71828-P02", quantity: 48 },
  { parentPartNumber: "FW71828", name: "Cooling Air Seal", partNumber: "FW71828-P03", quantity: 2 },

  // LPT Stage 1 Disk (FW73101)
  { parentPartNumber: "FW73101", name: "Blade Damper Pin", partNumber: "FW73101-P01", quantity: 92 },
  { parentPartNumber: "FW73101", name: "Disk Coupling Bolt", partNumber: "FW73101-P02", quantity: 32 },
];

/** Piece parts belonging to a given parent component part number. */
export function piecePartsForComponent(parentPartNumber: string): PiecePartDef[] {
  return PIECE_PART_CATALOG.filter(
    (p) => p.parentPartNumber === parentPartNumber,
  );
}
