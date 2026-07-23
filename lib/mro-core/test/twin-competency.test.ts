/**
 * ISA-95 Twin Competency Questions
 *
 * Each test encodes a query the digital twin must be able to answer
 * (per the ISA-95 domain-model review) and asserts that the type system
 * expresses it correctly.  Phase 1: structural assertions only.
 *
 * Uses the Node.js built-in test runner (tsx --test).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type {
  ISA95Engine,
  OperationSegment,
  ProcessSegment,
  WorkCenter,
} from "../src/ontology/index.js";

describe("ISA-95 Twin Competency Questions", () => {

  it("CQ1: Given an engine ESN, which work center is it currently in?", () => {
    // Query pattern:
    //   SELECT wc.* FROM work_centers wc
    //   JOIN engines e ON e.current_location_id = wc.id
    //   WHERE e.esn = :esn AND e.twin_state = 'IN_WORK'
    //
    // ISA95Engine carries currentLocationId for this join.
    const engine: Partial<ISA95Engine> = {
      esn: "XWB-10021",
      twinState: "IN_WORK",
      currentLocationId: "wc-uuid-borescope-bay",
    };
    assert.ok(engine.currentLocationId, "currentLocationId must be defined");
    assert.equal(engine.twinState, "IN_WORK");
  });

  it("CQ2: What operation segments are HOLD_SKILL at a given work centre?", () => {
    // Query pattern:
    //   SELECT os.* FROM operation_segments os
    //   WHERE os.assigned_work_center_id = :wcId
    //     AND os.segment_status = 'HOLD_SKILL'
    //
    // OperationSegment carries assignedWorkCenterId + segmentStatus.
    const segment: Partial<OperationSegment> = {
      assignedWorkCenterId: "wc-uuid-borescope-bay",
      segmentStatus: "HOLD_SKILL",
    };
    assert.equal(segment.segmentStatus, "HOLD_SKILL");
    assert.ok(segment.assignedWorkCenterId);
  });

  it("CQ3: What is the critical-path TAT if PENDING segments are scheduled optimally?", () => {
    // ProcessSegment carries estimatedDurationHours + canRunParallel.
    // Critical path = sum of non-parallel segments.
    const segments: Partial<ProcessSegment>[] = [
      { estimatedDurationHours: 8,  canRunParallel: false, sequenceNumber: 1 },
      { estimatedDurationHours: 16, canRunParallel: false, sequenceNumber: 2 },
      { estimatedDurationHours: 4,  canRunParallel: true,  sequenceNumber: 3 },
    ];
    const criticalPathHours = segments
      .filter((s) => !s.canRunParallel)
      .reduce((sum, s) => sum + (s.estimatedDurationHours ?? 0), 0);
    assert.equal(criticalPathHours, 24);
  });

  it("CQ4: Which work centres are above 80% capacity?", () => {
    // Query pattern:
    //   SELECT wc.id, COUNT(os.id)::numeric / wc.capacity * 100 as utilisation
    //   FROM work_centers wc
    //   LEFT JOIN operation_segments os ON os.assigned_work_center_id = wc.id
    //     AND os.segment_status NOT IN ('COMPLETE','SKIPPED','PENDING')
    //   GROUP BY wc.id HAVING utilisation > 0.8
    //
    // WorkCenter carries capacity.
    const wc: Partial<WorkCenter> = { capacity: 3 };
    const activeCount = 3;
    const utilisationPct = (activeCount / (wc.capacity ?? 1)) * 100;
    assert.ok(utilisationPct >= 80, "utilisation must be >= 80%");
  });

  it("CQ5: Which LLPs on engine X are within 200 cycles of their life limit?", () => {
    // Query pattern:
    //   SELECT l.*, (l.life_limit_cycles - l.csn) as cycles_remaining
    //   FROM llps l
    //   WHERE l.engine_id = :esn AND (l.life_limit_cycles - l.csn) < 200
    //
    // Already answerable by the existing llps table.
    const llp = { lifeLimitCycles: 20_000, csn: 19_850, engineId: "XWB-10021" };
    const cyclesRemaining = llp.lifeLimitCycles - llp.csn;
    assert.ok(cyclesRemaining < 200, "should flag near-life-limit LLP");
  });

});
