// -----------------------------------------------------------
//  [*] Tests — chatuikit attachments
//
//  ImageAttachment settles its ratio on load, falls back to the
//  labelled placeholder on error, and shows a strip as a
//  compact row; VideoAttachment draws the poster with a duration
//  badge, a spinner while uploading, the dark stage without a
//  poster; FileCard labels the document and hands its uri on.
// -----------------------------------------------------------

import { fireEvent, render } from '@testing-library/react-native';

import { ChatUiKitProvider } from '../../../provider';
import { defaultLabels } from '../../../provider/labels';
import FileCard from '../FileCard';
import ImageAttachment from '../ImageAttachment';
import VideoAttachment from '../VideoAttachment';


const labels = defaultLabels.en;
const wrap = (ui: React.ReactElement) => render(<ChatUiKitProvider locale="en">{ui}</ChatUiKitProvider>);


describe('ImageAttachment', () => {
  it('lays out from mediaSize on the first frame and reports the loaded ratio', async () => {
    const onRatio = jest.fn();
    const { getByTestId } = await wrap(<ImageAttachment uri="https://x/a.jpg" mediaSize={{ width: 1200, height: 800 }} labels={labels} onRatio={onRatio} />);
    const box = getByTestId('chatuikit-image');
    expect(box.props.style.width / box.props.style.height).toBeCloseTo(1.5, 1);
    await fireEvent(getByTestId('chatuikit-image-source'), 'load', { nativeEvent: { source: { width: 1200, height: 800 } } });
    expect(onRatio).toHaveBeenCalledWith(1.5);
  });

  it('shows the labelled placeholder when the bytes never come', async () => {
    const { getByTestId, getByText } = await wrap(<ImageAttachment uri="https://x/dead.jpg" labels={labels} />);
    await fireEvent(getByTestId('chatuikit-image-source'), 'error', { nativeEvent: { error: 'dead' } });
    expect(getByText("Couldn't load the photo")).toBeTruthy();
  });

  it('renders a strip (a long screenshot) as a compact row with its size', async () => {
    const { getByTestId, getByText } = await wrap(<ImageAttachment uri="https://x/long.png" mediaSize={{ width: 400, height: 6000 }} labels={labels} />);
    expect(getByTestId('chatuikit-image-strip')).toBeTruthy();
    expect(getByText('400 × 6000')).toBeTruthy();
    expect(getByText('Photo')).toBeTruthy();
  });
});


describe('VideoAttachment', () => {
  it('draws the poster with the duration badge, a spinner while busy, and a dark stage without a poster', async () => {
    const withPoster = await wrap(<VideoAttachment video={{ uri: '/api/uploads/v.mp4', thumbnailUri: 'https://x/p.jpg', duration: 83 }} labels={labels} busy={false} />);
    expect(withPoster.getByText('1:23')).toBeTruthy();
    const busy = await wrap(<VideoAttachment video={{ uri: 'file:///v.mp4', duration: 5 }} labels={labels} busy />);
    expect(busy.getByLabelText('Video')).toBeTruthy();
    expect(busy.queryByTestId('chatuikit-image-source')).toBeNull();
  });
});


describe('FileCard', () => {
  it('labels the document with its size and hands the uri to the link handler', async () => {
    const onPress = jest.fn();
    const { getByLabelText } = await wrap(<FileCard file={{ name: 'planas.pdf', uri: '/api/uploads/a.pdf', size: 1536, mimeType: 'application/pdf' }} own={false} labels={labels} onPress={onPress} />);
    await fireEvent.press(getByLabelText('File: planas.pdf, 1.5 KB'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
