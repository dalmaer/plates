// The selected checked consumer keeps a bounded environment contract.
import { identityEnvironmentValue } from '../practices/night/files/scripts/plates/names-environment.mjs';
const selected: string | undefined = identityEnvironmentValue('variable:KEEL_SUITE_PLAN', process.env);
// @ts-expect-error A binding identity must be a string.
identityEnvironmentValue(3);
// @ts-expect-error Process environment values are strings or absent, never numbers.
identityEnvironmentValue('variable:KEEL_SUITE_PLAN', { PLATES_SUITE_PLAN: 3 });
// @ts-expect-error Missing bindings remain absent; a string cannot be invented.
const required: string = selected;
void required;
