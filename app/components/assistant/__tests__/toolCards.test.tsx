// -----------------------------------------------------------
//  [*] Tests — the humanized tool cards
//
//  The registry's contract: every frozen tool name gets a
//  renderer; a running card shows the running title, a done
//  card the done title, a failed card the tool's own title
//  with the failed label AND its error text verbatim (the
//  screenshot rule); the schedule summary composes group /
//  range / date with dots and the query summary quotes the
//  words — both answering '' for empty input so no stray
//  line renders.
// -----------------------------------------------------------

import { render } from '@testing-library/react-native';

import {
  createAssistantToolCards,
  summarizeQueryInput,
  summarizeScheduleInput,
  type ToolCardStrings,
} from '../toolCards';
import { defaultColors } from '@knf/assistantuikit';


const STRINGS: ToolCardStrings = {
  scheduleRunning: 'Ieškoma tvarkaraštyje…',
  scheduleDone: 'Tvarkaraštis',
  newsRunning: 'Ieškoma naujienose…',
  newsDone: 'Naujienos',
  handbookRunning: 'Ieškoma žinyne…',
  handbookDone: 'Žinynas',
  failed: 'nepavyko',
  week: 'savaitė',
  day: 'diena',
};

const cards = createAssistantToolCards(STRINGS, defaultColors);


describe('the summaries', () => {
  it('compose the schedule line and quote the query, empty for empty input', () => {
    expect(summarizeScheduleInput({ group: 'FT-1', range: 'week', date: '2026-09-15' }, STRINGS))
      .toBe('FT-1 · savaitė · 2026-09-15');
    expect(summarizeScheduleInput({ teacher: 'A. Petraitis', range: 'day' }, STRINGS))
      .toBe('A. Petraitis · diena');
    expect(summarizeScheduleInput({}, STRINGS)).toBe('');
    expect(summarizeQueryInput({ query: 'wifi' })).toBe('„wifi“');
    expect(summarizeQueryInput({})).toBe('');
  });
});


describe('the cards', () => {
  it('covers every frozen tool name', () => {
    expect(Object.keys(cards).sort()).toEqual(['lookupSchedule', 'searchHandbook', 'searchNews']);
  });

  it('titles by status and keeps a failed call´s error text visible', async () => {
    const running = await render(<>{cards.lookupSchedule({ toolName: 'lookupSchedule', input: { group: 'FT-1' }, status: 'running' })}</>);
    expect(running.getByText('Ieškoma tvarkaraštyje…')).toBeTruthy();
    expect(running.getByText('FT-1')).toBeTruthy();

    const done = await render(<>{cards.searchHandbook({ toolName: 'searchHandbook', input: { query: 'stipendija' }, status: 'done' })}</>);
    expect(done.getByText('Žinynas')).toBeTruthy();
    expect(done.getByText('„stipendija“')).toBeTruthy();

    const failed = await render(<>{cards.searchNews({
      toolName: 'searchNews', input: { query: 'x' }, status: 'failed',
      errorText: 'DJANGO_UNREACHABLE: Backend unreachable',
    })}</>);
    expect(failed.getByText('Naujienos — nepavyko')).toBeTruthy();
    expect(failed.getByText('DJANGO_UNREACHABLE: Backend unreachable')).toBeTruthy();
  });
});
