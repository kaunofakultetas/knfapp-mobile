import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ChatUiKitProvider, useKitLabels, useKitTheme } from '..';
import { darkTheme } from '../theme';

function Probe() {
  const labels = useKitLabels();
  const { scheme, avatarColors } = useKitTheme();
  return <Text>{`${labels.send}|${labels.emptyChat}|${scheme}|${avatarColors.length}`}</Text>;
}

describe('ChatUiKitProvider', () => {
  it('merges a partial labels object over the locale\'s defaults', async () => {
    const { getByText } = await render(
      <ChatUiKitProvider locale="lt" labels={{ send: 'Siųsti!' }}>
        <Probe />
      </ChatUiKitProvider>,
    );
    expect(getByText('Siųsti!|Žinučių dar nėra — pasisveikinkite|light|8')).toBeTruthy();
  });

  it('answers the English set and the light scheme with nothing passed, the dark theme when given', async () => {
    const plain = await render(<Probe />);
    expect(plain.getByText('Send message|No messages yet — say hello|light|8')).toBeTruthy();
    const dark = await render(
      <ChatUiKitProvider theme={{ ...darkTheme, avatarColors: ['#111', '#222'] }}>
        <Probe />
      </ChatUiKitProvider>,
    );
    expect(dark.getByText('Send message|No messages yet — say hello|dark|2')).toBeTruthy();
  });
});
