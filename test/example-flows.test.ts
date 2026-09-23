import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

// Activepieces installs the newest version inside an imported flow's
// `pieceVersion` range. Every example once pinned `~0.1.0`, so a user importing
// one got a piece four releases old. Pinning the range to the manifest's minor
// makes a minor bump fail here until the examples follow it.

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const [major, minor] = pkg.version.split('.');
const expected = `~${major}.${minor}.0`;

const dir = new URL('../examples/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

function beliqSteps(node: unknown): Array<{ pieceVersion: string }> {
  if (Array.isArray(node)) return node.flatMap(beliqSteps);
  if (node === null || typeof node !== 'object') return [];
  const obj = node as Record<string, unknown>;
  const own = obj.pieceName === pkg.name ? [obj as { pieceVersion: string }] : [];
  return [...own, ...Object.values(obj).flatMap(beliqSteps)];
}

describe('example flows', () => {
  it('ships at least one example', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s installs the current minor of this piece', (file) => {
    const flow = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    const steps = beliqSteps(flow);
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) expect(step.pieceVersion).toBe(expected);
  });
});
