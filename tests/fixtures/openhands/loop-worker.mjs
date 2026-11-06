// Fast regression double; explicitly not native OpenHands evidence.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2), get = key => args[args.indexOf(key) + 1];
const workspace = get('--workspace'), receipt = get('--receipt'), strategy = get('--strategy');
if (!existsSync(receipt)) {
  const input = JSON.parse(readFileSync(join(workspace, 'input.json'), 'utf8'));
  const actual = { greeting: `Hello ${strategy === 'normalize' ? input.name.trim() : input.name}!` };
  const expected = { greeting: `Hello ${input.preserveWhitespace ? input.name : input.name.trim()}!` };
  const outputAbsentBeforeApproval = !existsSync(join(workspace, 'output.json'));
  writeFileSync(join(workspace, 'output.json'), JSON.stringify(actual));
  writeFileSync(receipt, JSON.stringify({ schema: 1, backend: 'fixture-only', status: 'completed', binding: { workspace, strategy }, confirmation: { approved: true, authority: 'fixture-only', waitingBeforeApproval: true, outputExistedBeforeApproval: !outputAbsentBeforeApproval }, effect: { executions: 1 }, test: { passed: JSON.stringify(actual) === JSON.stringify(expected), actual, expected }, model: { kind: 'fixture-only', calls: 2, inputTokens: 20, outputTokens: 10, tokensSynthetic: true, providerCalls: 0 }, events: [{ kind: 'fixture-only', warning: 'no SDK was executed' }] }));
}
