// -----------------------------------------------------------
//  [*] Tests — fetchScheduleWeek: paging past the 500-row cap
//
//  The backend answers at most 500 rows a call and a semester
//  holds more; the week fetch must walk ?offset until a short
//  page, concatenate in order, and never loop forever on a
//  backend that keeps answering full pages.
// -----------------------------------------------------------

const mockGet = jest.fn();
jest.mock('@/services/api/client', () => ({
  api: { get: (...args: unknown[]) => mockGet(...(args as [])) },
  request: async (call: Promise<{ data: unknown }>) => (await call).data,
}));

import { fetchScheduleWeek, type ScheduleLesson } from '@/services/api/schedule';

const row = (id: number): ScheduleLesson => ({
  id: String(id),
  title: `L${id}`,
  teacher: 'A. Petraitis',
  room: '112',
  timeStart: '09:00',
  timeEnd: '10:30',
  dayOfWeek: 0,
  group: 'ISKS-1',
  semester: '2026-R',
});

const page = (from: number, count: number) => ({
  data: { lessons: Array.from({ length: count }, (_, i) => row(from + i)) },
});

beforeEach(() => mockGet.mockReset());

describe('fetchScheduleWeek', () => {
  it('a short first page is the whole answer — one call', async () => {
    mockGet.mockResolvedValueOnce(page(0, 3));
    const resp = await fetchScheduleWeek('2026-R');
    expect(resp.lessons).toHaveLength(3);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('/schedule', {
      params: { limit: 500, offset: 0, semester: '2026-R' },
    });
  });

  it('full pages keep walking the offset until a short one, in order', async () => {
    mockGet
      .mockResolvedValueOnce(page(0, 500))
      .mockResolvedValueOnce(page(500, 500))
      .mockResolvedValueOnce(page(1000, 53));
    const resp = await fetchScheduleWeek('2026-R');
    expect(resp.lessons).toHaveLength(1053);
    expect(resp.lessons[0].id).toBe('0');
    expect(resp.lessons[1052].id).toBe('1052');
    expect(mockGet.mock.calls.map((call) => (call[1] as { params: { offset: number } }).params.offset)).toEqual([
      0, 500, 1000,
    ]);
  });

  it('omits the semester param entirely when none is given', async () => {
    mockGet.mockResolvedValueOnce(page(0, 1));
    await fetchScheduleWeek();
    expect(mockGet).toHaveBeenCalledWith('/schedule', { params: { limit: 500, offset: 0 } });
  });

  it("a deliberate all-semesters choice rides as the literal 'all' — an omitted param means newest to the backend", async () => {
    mockGet.mockResolvedValueOnce(page(0, 1));
    await fetchScheduleWeek('all');
    expect(mockGet).toHaveBeenCalledWith('/schedule', { params: { limit: 500, offset: 0, semester: 'all' } });
  });

  it('an exactly-full final page costs one extra empty call, never a loop', async () => {
    mockGet.mockResolvedValueOnce(page(0, 500)).mockResolvedValueOnce({ data: { lessons: [] } });
    const resp = await fetchScheduleWeek('2026-R');
    expect(resp.lessons).toHaveLength(500);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('a runaway backend that always answers full pages hits the page fence', async () => {
    mockGet.mockImplementation(async (...args: unknown[]) => {
      const { params } = args[1] as { params: { offset: number } };
      return page(params.offset, 500);
    });
    const resp = await fetchScheduleWeek('2026-R');
    expect(mockGet).toHaveBeenCalledTimes(10);
    expect(resp.lessons).toHaveLength(5000);
  });
});
