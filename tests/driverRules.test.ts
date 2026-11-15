import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('firestore.rules driver document', () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  it('allows a driver with no phone number (phone is optional in the form)', () => {
    expect(rules).toContain('isValidString(data.phone, 0, 25)');
    expect(rules).not.toContain('isValidString(data.phone, 5, 25)');
  });
});
