import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The Documents & Expiry picker writes documentType verbatim to Firestore.
// firestore.rules only allows an enumerated set, so every selectable category
// must be inside that allowlist or saving fails with permission-denied.
describe('Documents & Expiry categories vs firestore.rules', () => {
  const view = readFileSync('src/components/DriversAndOpsViews.tsx', 'utf8');
  const rules = readFileSync('firestore.rules', 'utf8');

  const listMatch = view.match(
    /const DOCUMENT_CATEGORIES[^=]*= \[([\s\S]*?)\];/
  );
  const enumMatch = rules.match(
    /data\.documentType in \[([\s\S]*?)\]/
  );
  if (!listMatch || !enumMatch) throw new Error('expected sources not found');
  const categories = [...listMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const allowed = [...enumMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

  it('offers at least the statutory vehicle documents', () => {
    expect(categories).toContain('Permit Certificate');
    expect(categories).toContain('Insurance Policy');
  });

  it('every selectable category is allowed by the deployed rules', () => {
    for (const c of categories) expect(allowed).toContain(c);
  });

  it('no retired alias category names remain in the picker', () => {
    for (const alias of [
      'Commercial Permit',
      'Pollution Certificate (PUC)',
      'Tax Token',
      'Driver License (DL)',
      'Service Invoice',
    ]) {
      expect(categories).not.toContain(alias);
    }
  });
});
