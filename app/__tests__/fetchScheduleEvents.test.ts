// -----------------------------------------------------------
//  [*] Tests — fetchScheduleEvents: params + the 500-row cap
//
//  The backend answers at most 500 rows a call and a wide
//  window holds more; the events fetch must walk ?offset
//  until a short page, concatenate in order, and never loop
//  forever on a backend that keeps answering full pages. The
//  scope params are a wire contract too: group and teacher
//  ride only when set — an empty param would read as a filter
//  for the empty string server-side.
// -----------------------------------------------------------

const mockGet = jest.fn();
jest.mock('@/services/api/client', () => ({
  api: { get: (...args: unknown[]) => mockGet(...(args as [])) },
  request: async (call: Promise<{ data: unknown }>) => (await call).data,
}));

import { fetchScheduleEvents, type ScheduleEventRow } from '@/services/api/schedule';

const row = (id: number): ScheduleEventRow => ({
  id: String(id),
  title: `L${id}`,
  teacher: 'A. Petraitis',
  room: '112',
  timeStart: '09:00',
  timeEnd: '10:30',
  dayOfWeek: 0,
  group: 'ISKS-1',
  semester: '2026-R',
  date: '2026-09-14',
  lectureType: '',
});

const page = (from: number, count: number) => ({
  data: { events: Array.from({ length: count }, (_, i) => row(from + i)) },
});

beforeEach(() => mockGet.mockReset());

describe('fetchScheduleEvents', () => {
  it('a short first page is the whole answer — one call, bare window params', async () => {
    mockGet.mockResolvedValueOnce(page(0, 3));
    const resp = await fetchScheduleEvents('2026-09-14', '2026-09-20');
    expect(resp.events).toHaveLength(3);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('/schedule/events', {
      params: { from: '2026-09-14', to: '2026-09-20', limit: 500, offset: 0 },
    });
  });

  it('sends the group scope as ?group=', async () => {
    mockGet.mockResolvedValueOnce(page(0, 1));
    await fetchScheduleEvents('2026-09-14', '2026-09-20', 'ISKS-1');
    expect(mockGet).toHaveBeenCalledWith('/schedule/events', {
      params: { from: '2026-09-14', to: '2026-09-20', limit: 500, offset: 0, group: 'ISKS-1' },
    });
  });

  it('sends the teacher scope as ?teacher= — the exact display string, titles included', async () => {
    mockGet.mockResolvedValueOnce(page(0, 1));
    await fetchScheduleEvents('2026-09-14', '2026-09-20', undefined, 'Eimantas Rebždys, Lekt.');
    expect(mockGet).toHaveBeenCalledWith('/schedule/events', {
      params: {
        from: '2026-09-14',
        to: '2026-09-20',
        limit: 500,
        offset: 0,
        teacher: 'Eimantas Rebždys, Lekt.',
      },
    });
  });

  it('full pages keep walking the offset until a short one, in order', async () => {
    mockGet
      .mockResolvedValueOnce(page(0, 500))
      .mockResolvedValueOnce(page(500, 500))
      .mockResolvedValueOnce(page(1000, 53));
    const resp = await fetchScheduleEvents('2026-09-01', '2027-01-31');
    expect(resp.events).toHaveLength(1053);
    expect(resp.events[0].id).toBe('0');
    expect(resp.events[1052].id).toBe('1052');
    expect(mockGet.mock.calls.map((call) => (call[1] as { params: { offset: number } }).params.offset)).toEqual([
      0, 500, 1000,
    ]);
  });

  it('an exactly-full final page costs one extra empty call, never a loop', async () => {
    mockGet.mockResolvedValueOnce(page(0, 500)).mockResolvedValueOnce({ data: { events: [] } });
    const resp = await fetchScheduleEvents('2026-09-01', '2027-01-31');
    expect(resp.events).toHaveLength(500);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('a runaway backend that always answers full pages hits the page fence', async () => {
    mockGet.mockImplementation(async (...args: unknown[]) => {
      const { params } = args[1] as { params: { offset: number } };
      return page(params.offset, 500);
    });
    const resp = await fetchScheduleEvents('2026-09-01', '2027-01-31');
    expect(mockGet).toHaveBeenCalledTimes(10);
    expect(resp.events).toHaveLength(5000);
  });
});
