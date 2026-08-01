import { runStageChecks } from './check-stages.mjs';

if (process.argv.length !== 2) {
  throw new RangeError('Usage: vp run crown-breaker#render:stages (this command accepts no arguments)');
}

await runStageChecks({ writeScreenshots: true });
