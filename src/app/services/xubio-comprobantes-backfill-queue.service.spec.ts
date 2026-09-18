import { buildScheduledBackfillWindow } from './xubio-comprobantes-backfill-queue.service';

describe('buildScheduledBackfillWindow', () => {
  it('covers the last days up to today', () => {
    expect(
      buildScheduledBackfillWindow(7, new Date('2026-09-18T11:30:00.000Z')),
    ).toEqual({
      fechaDesde: '2026-09-11',
      fechaHasta: '2026-09-18',
    });
  });

  it('overlaps between consecutive runs, so a missed run leaves no hole', () => {
    const morning = buildScheduledBackfillWindow(
      7,
      new Date('2026-09-18T09:00:00.000Z'),
    );
    const twoDaysLater = buildScheduledBackfillWindow(
      7,
      new Date('2026-09-20T09:00:00.000Z'),
    );

    expect(twoDaysLater.fechaDesde <= morning.fechaHasta).toBe(true);
  });

  it('crosses the month boundary backwards', () => {
    expect(
      buildScheduledBackfillWindow(7, new Date('2026-09-03T09:00:00.000Z')),
    ).toEqual({
      fechaDesde: '2026-08-27',
      fechaHasta: '2026-09-03',
    });
  });
});
