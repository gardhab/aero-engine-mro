// ISA-95 aligned ontology type layer — barrel export.
// All twin classes extend ISA95BaseModel from common/BaseModel.

// Common primitives
export * from "./common/BaseModel.js";
export * from "./common/HierarchyScope.js";

// Operations — ISA-95 Equipment Hierarchy
export * from "./operations/EquipmentHierarchy.js";
export * from "./operations/Equipment.js";

// Product — Engine/Module as PhysicalAssets
export * from "./product/Engine.js";

// Personnel
export * from "./personnel/PersonnelClass.js";

// Material
export * from "./material/Material.js";

// Execution — OperationsRequest / OperationSegment / ProcessSegment
export * from "./execution/OperationsExecution.js";
export * from "./execution/ProcessSegment.js";
