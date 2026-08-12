import { runSeoTestSuite, printTestReport } from './test-e2e-seo.mjs';

async function main() {
  console.log('Starting automated SEO & indexing audit...\n');
  try {
    const results = await runSeoTestSuite();
    printTestReport(results);
    if (results.failed > 0) {
      console.error(`\n[AUDIT FAILED] ${results.failed} check(s) failed.`);
      process.exit(1);
    } else {
      console.log('\n[AUDIT PASSED] 100% of SEO & indexing checks passed successfully.');
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal audit error:', err);
    process.exit(1);
  }
}

main();
