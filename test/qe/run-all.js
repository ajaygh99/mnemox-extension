// Mnemox QE Suite — orchestrator
// Run: node test/qe/run-all.js
// Runs every *.test.js suite in this directory in order, aggregates a
// single PASS/FAIL count, and exits non-zero if anything failed (CI-safe).
//
// Requires `jsdom` to be installed (only used by the integration/regression
// suites). If it isn't present, run:  npm install --no-save jsdom
// from the repo root first.

'use strict';

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const suiteFiles = fs.readdirSync(DIR)
  .filter(f => f.endsWith('.test.js'))
  .sort(); // numeric prefixes (01-, 02-, ...) keep this in intended order

const { summary } = require('./lib/framework');

async function main() {
  console.log('==============================================');
  console.log(' Mnemox QE Suite — full run');
  console.log('==============================================\n');

  const suiteResults = [];

  for (const file of suiteFiles) {
    const before = { pass: summary().pass, fail: summary().fail, skip: summary().skip };
    console.log(`\n---- ${file} ----`);
    try {
      const run = require(path.join(DIR, file));
      await run();
    } catch (e) {
      console.log(`  \x1b[31mSUITE CRASHED\x1b[0m: ${e.stack || e.message}`);
      summary().fail++;
    }
    const after = summary();
    suiteResults.push({
      file,
      pass: after.pass - before.pass,
      fail: after.fail - before.fail,
      skip: after.skip - before.skip,
    });
  }

  console.log('\n==============================================');
  console.log(' Per-suite summary');
  console.log('==============================================');
  suiteResults.forEach(r => {
    const status = r.fail > 0 ? '\x1b[31mFAIL\x1b[0m' : '\x1b[32mPASS\x1b[0m';
    console.log(`  ${status}  ${r.file}  (${r.pass} passed, ${r.fail} failed, ${r.skip} skipped)`);
  });

  const s = summary();
  console.log('\n==============================================');
  console.log(` TOTAL: ${s.pass} passed, ${s.fail} failed, ${s.skip} skipped`);
  console.log('==============================================\n');

  if (s.fail > 0) {
    console.log('Failures:');
    s.failures.forEach(f => console.log(`  - ${f.path}\n    ${f.error.message}`));
    process.exitCode = 1;
  } else {
    console.log('All suites green.');
    process.exitCode = 0;
  }

  // Force-exit: jsdom windows created by the integration/regression suites
  // can leave timers/observers alive that would otherwise keep the Node
  // process running indefinitely after all tests have finished.
  process.exit(process.exitCode);
}

main();
