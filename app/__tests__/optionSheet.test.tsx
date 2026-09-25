// -----------------------------------------------------------
//  [*] Tests — OptionSheet, the room's pick-one sheet
//
//  Every row is a 44pt target, a read-only list (seen-by)
//  still has a way out — the footer Close and the iOS escape
//  gesture; the scrim is hidden from screen readers, so
//  VoiceOver was once trapped in the seen-by sheet — and a
//  pick reports the row's id.
// -----------------------------------------------------------

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ colors: { brand: '#123' } }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));

import { fireEvent, render } from '@testing-library/react-native';

import OptionSheet from '@/components/chat/OptionSheet';


// Two readers of an own group message
const ROWS = [
  { id: 'u1', label: 'Ieva', detail: '12:04' },
  { id: 'u2', label: 'Jonas', detail: '12:09', active: true },
];


describe('OptionSheet', () => {
  it('a read-only list closes from the footer and the escape gesture', async () => {
    const onClose = jest.fn();
    const view = await render(<OptionSheet visible title="Seen by" rows={ROWS} onClose={onClose} />);
    await fireEvent.press(view.getByTestId('option-sheet-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await fireEvent(view.getByTestId('option-sheet'), 'accessibilityEscape');
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(view.getByTestId('option-u1').props.accessibilityRole).toBe('text');
  });

  it('rows are 44pt targets and a pick reports the id', async () => {
    const onPick = jest.fn();
    const view = await render(<OptionSheet visible title="Forward" rows={ROWS} onPick={onPick} onClose={() => {}} />);
    const row = view.getByTestId('option-u2');
    expect(row.props.className ?? '').toContain('min-h-11');
    expect(row.props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(row);
    expect(onPick).toHaveBeenCalledWith('u2');
  });

  it('an empty list says so instead of drawing nothing', async () => {
    const view = await render(<OptionSheet visible title="Forward" rows={[]} emptyLabel="No rooms" onPick={() => {}} onClose={() => {}} />);
    expect(view.getByText('No rooms')).toBeTruthy();
  });
});
