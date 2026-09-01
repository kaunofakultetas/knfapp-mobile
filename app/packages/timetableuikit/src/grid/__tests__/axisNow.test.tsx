// -----------------------------------------------------------
//  [*] Tests — HourAxis positions and NowLine gating
// -----------------------------------------------------------

import { render } from '@testing-library/react-native';

import HourAxis from '../HourAxis';
import NowLine from '../NowLine';

const WINDOW = { startMin: 480, endMin: 1260 }; // 08:00–21:00

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean) as object[]);

describe('HourAxis', () => {
  it('labels every integer hour of the window, positioned by the same fractions as the cells', async () => {
    const view = await render(<HourAxis window={WINDOW} height={780} />);
    for (let h = 8; h <= 21; h++) expect(view.getByTestId(`timetableuikit-axis-${h}`)).toBeTruthy();
    expect(view.queryByTestId('timetableuikit-axis-7')).toBeNull();
    expect(view.queryByTestId('timetableuikit-axis-22')).toBeNull();

    const nine = view.getByTestId('timetableuikit-axis-9');
    expect(nine.props.children).toBe('9:00');
    expect(flat(nine.props.style).top).toBe(53); // (540-480)/780 * 780 - 7
  });

  it('a ragged window starts at the first WHOLE hour inside it', async () => {
    const view = await render(<HourAxis window={{ startMin: 500, endMin: 620 }} height={120} />);
    expect(view.queryByTestId('timetableuikit-axis-8')).toBeNull();
    expect(view.getByTestId('timetableuikit-axis-9')).toBeTruthy();
    expect(view.getByTestId('timetableuikit-axis-10')).toBeTruthy();
  });
});

describe('NowLine', () => {
  it('renders inside the window, at the fraction of the height', async () => {
    const view = await render(<NowLine window={WINDOW} nowMin={600} height={780} />);
    const line = view.getByTestId('timetableuikit-nowline');
    expect(flat(line.props.style).top).toBe(119); // (600-480)/780*780 - 1
  });

  it('is GATED outside the window — both ends', async () => {
    const early = await render(<NowLine window={WINDOW} nowMin={470} height={780} />);
    expect(early.toJSON()).toBeNull();
    const late = await render(<NowLine window={WINDOW} nowMin={1270} height={780} />);
    expect(late.toJSON()).toBeNull();
  });

  it('the window edges still count as inside', async () => {
    const start = await render(<NowLine window={WINDOW} nowMin={480} height={780} />);
    expect(start.toJSON()).not.toBeNull();
    const end = await render(<NowLine window={WINDOW} nowMin={1260} height={780} />);
    expect(end.toJSON()).not.toBeNull();
  });
});
