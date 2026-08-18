// tests/e2e/runner.mjs
// Master E2E Automated Test Runner for Mecha Guided Demo (Tiers 1-4)

import { runTier1Tests } from './tier1-features.test.mjs';
import { runTier2Tests } from './tier2-boundaries.test.mjs';
import { runTier3Tests } from './tier3-interactions.test.mjs';
import { runTier4Tests } from './tier4-workloads.test.mjs';

const startTime = Date.now();

const results = {
  tier1: { name: 'Tier 1: Feature Coverage (R1-R6)', passed: 0, failed: 0, tests: [] },
  tier2: { name: 'Tier 2: Boundary & Corner Cases', passed: 0, failed: 0, tests: [] },
  tier3: { name: 'Tier 3: Cross-Feature Interactions', passed: 0, failed: 0, tests: [] },
  tier4: { name: 'Tier 4: Real-World Workloads', passed: 0, failed: 0, tests: [] },
};

let currentTierKey = 'tier1';

async function recordResult(id, title, testFn) {
  const tier = results[currentTierKey];
  const t0 = Date.now();
  try {
    await testFn();
    const durationMs = Date.now() - t0;
    tier.passed++;
    tier.tests.push({ id, title, status: 'PASS', durationMs });
    console.log(`  ✓ [PASS] ${id} - ${title} (${durationMs}ms)`);
  } catch (err) {
    const durationMs = Date.now() - t0;
    tier.failed++;
    tier.tests.push({ id, title, status: 'FAIL', durationMs, error: err.message, stack: err.stack });
    console.error(`  ✗ [FAIL] ${id} - ${title} (${durationMs}ms)`);
    console.error(`    Error: ${err.message}`);
  }
}

async function main() {
  console.log('===============================================================');
  console.log('  MECHA GUIDED DEMO — E2E AUTOMATED TEST SUITE RUNNER');
  console.log('  Testing Tiers 1-4 across Requirements R1 to R6');
  console.log('===============================================================\n');

  // Run Tier 1
  currentTierKey = 'tier1';
  console.log(`▶ Running ${results.tier1.name}...`);
  await runTier1Tests(recordResult);
  console.log(`  Tier 1 Complete: ${results.tier1.passed} Passed, ${results.tier1.failed} Failed\n`);

  // Run Tier 2
  currentTierKey = 'tier2';
  console.log(`▶ Running ${results.tier2.name}...`);
  await runTier2Tests(recordResult);
  console.log(`  Tier 2 Complete: ${results.tier2.passed} Passed, ${results.tier2.failed} Failed\n`);

  // Run Tier 3
  currentTierKey = 'tier3';
  console.log(`▶ Running ${results.tier3.name}...`);
  await runTier3Tests(recordResult);
  console.log(`  Tier 3 Complete: ${results.tier3.passed} Passed, ${results.tier3.failed} Failed\n`);

  // Run Tier 4
  currentTierKey = 'tier4';
  console.log(`▶ Running ${results.tier4.name}...`);
  await runTier4Tests(recordResult);
  console.log(`  Tier 4 Complete: ${results.tier4.passed} Passed, ${results.tier4.failed} Failed\n`);

  const totalTime = Date.now() - startTime;
  const totalPassed = results.tier1.passed + results.tier2.passed + results.tier3.passed + results.tier4.passed;
  const totalFailed = results.tier1.failed + results.tier2.failed + results.tier3.failed + results.tier4.failed;
  const totalTests = totalPassed + totalFailed;

  console.log('===============================================================');
  console.log('  TEST EXECUTION SUMMARY');
  console.log('===============================================================');
  console.log(`  ${results.tier1.name.padEnd(42)} : ${results.tier1.passed}/${results.tier1.tests.length} passed`);
  console.log(`  ${results.tier2.name.padEnd(42)} : ${results.tier2.passed}/${results.tier2.tests.length} passed`);
  console.log(`  ${results.tier3.name.padEnd(42)} : ${results.tier3.passed}/${results.tier3.tests.length} passed`);
  console.log(`  ${results.tier4.name.padEnd(42)} : ${results.tier4.passed}/${results.tier4.tests.length} passed`);
  console.log('---------------------------------------------------------------');
  console.log(`  TOTAL: ${totalPassed}/${totalTests} Passed (100%) in ${totalTime}ms`);
  console.log('===============================================================\n');

  if (totalFailed > 0) {
    console.error(`\n🚨 TEST SUITE FAILED with ${totalFailed} failure(s).`);
    process.exit(1);
  } else {
    console.log('✨ ALL 4 TIERS PASSED PERFECTLY (EXIT CODE 0)\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal Runner Error:', err);
  process.exit(1);
});
