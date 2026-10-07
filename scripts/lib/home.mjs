import { homedir } from 'node:os';
import { join } from 'node:path';

export const PLAN_REVIEW_HOME = join(homedir(), '.claude', 'plan-review');
