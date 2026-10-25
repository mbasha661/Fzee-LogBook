import {describe, expect, it} from 'vitest';
import {computeOdometerAfterEntryDelete} from '../src/lib/calculations';

const vehicle = {id: 'veh-1', currentOdometerKm: 65060};

const entries = [
  {id: 'e1', vehicleId: 'veh-1', startingKm: 64940, endingKm: 65060},
  {id: 'e2', vehicleId: 'veh-1', startingKm: 64800, endingKm: 64940},
  {id: 'e3', vehicleId: 'veh-2', startingKm: 1000, endingKm: 1200},
];

describe('computeOdometerAfterEntryDelete', () => {
  it('rolls the odometer back to the highest remaining ending KM when the deleted entry set the reading', () => {
    expect(computeOdometerAfterEntryDelete(vehicle, entries[0], entries)).toBe(
      64940
    );
  });

  it('falls back to the deleted entry starting KM when no other entries remain', () => {
    expect(
      computeOdometerAfterEntryDelete(vehicle, entries[0], [entries[0]])
    ).toBe(64940);
  });

  it('returns null when the deleted entry did not set the current odometer', () => {
    expect(computeOdometerAfterEntryDelete(vehicle, entries[1], entries)).toBeNull();
  });

  it('returns null for an unknown vehicle', () => {
    expect(
      computeOdometerAfterEntryDelete(undefined, entries[0], entries)
    ).toBeNull();
  });

  it('recomputes when the deleted entry ending equals the current odometer', () => {
    const v = {id: 'veh-1', currentOdometerKm: 64940};
    expect(computeOdometerAfterEntryDelete(v, entries[1], entries)).toBe(65060);
  });

  it('ignores entries belonging to other vehicles', () => {
    const v2 = {id: 'veh-2', currentOdometerKm: 1200};
    expect(computeOdometerAfterEntryDelete(v2, entries[2], entries)).toBe(1000);
  });

  it('never returns a negative odometer', () => {
    const v = {id: 'veh-9', currentOdometerKm: 0};
    const del = {id: 'x', vehicleId: 'veh-9', startingKm: -50, endingKm: 0};
    expect(computeOdometerAfterEntryDelete(v, del, [del])).toBe(0);
  });

  it('matches the original audit scenario: 64,940 -> 65,060 -> delete -> 64,940', () => {
    const v = {id: 'veh-demo-1', currentOdometerKm: 65060};
    const saved = {
      id: 'entry-new',
      vehicleId: 'veh-demo-1',
      startingKm: 64940,
      endingKm: 65060,
    };
    const prior = {
      id: 'entry-prior',
      vehicleId: 'veh-demo-1',
      startingKm: 64800,
      endingKm: 64940,
    };
    expect(
      computeOdometerAfterEntryDelete(v, saved, [saved, prior])
    ).toBe(64940);
  });
});
