// -----------------------------------------------------------
//  [*] Tests — @knf/dataengine useNetworkRestore
//
//  The subscription is created once yet always runs the
//  closure from the latest render; it dies with the hook; and
//  it fires for both restore reasons — an offline→online
//  transition of the network source and the host's
//  signalRestore().
// -----------------------------------------------------------

import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { manualNetwork } from '../../core/network';
import { DataEngineProvider, useDataEngine } from '../../provider';
import { useNetworkRestore } from '../useNetworkRestore';


const wrapperFor = (net: ReturnType<typeof manualNetwork>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <DataEngineProvider network={net}>{children}</DataEngineProvider>;
  };


describe('useNetworkRestore', () => {
  it('runs the latest closure through one stable subscription and unsubscribes on unmount', async () => {
    const net = manualNetwork(true);
    const calls: string[] = [];

    const h = await renderHook(
      ({ tag }: { tag: string }) => {
        useNetworkRestore(() => calls.push(tag));
        return useDataEngine();
      },
      { wrapper: wrapperFor(net), initialProps: { tag: 'first' } },
    );


    // A restore after a rerender must see the newest capture —
    // and exactly once, proving no second subscription piled up
    await h.rerender({ tag: 'second' });
    await act(async () => {
      h.result.current.signalRestore();
    });
    expect(calls).toEqual(['second']);


    // After unmount the listener is gone — a late restore
    // reaches nobody
    const env = h.result.current;
    await h.unmount();
    await act(async () => {
      env.signalRestore();
    });
    expect(calls).toEqual(['second']);
  });


  it('fires once per offline→online transition, and for signalRestore', async () => {
    const net = manualNetwork(true);
    const callback = jest.fn();

    const h = await renderHook(
      () => {
        useNetworkRestore(callback);
        return useDataEngine();
      },
      { wrapper: wrapperFor(net) },
    );


    // Going offline alone is not a restore
    await act(async () => {
      net.set(false);
    });
    expect(callback).not.toHaveBeenCalled();


    await act(async () => {
      net.set(true);
    });
    expect(callback).toHaveBeenCalledTimes(1);


    // Re-announcing online while already online adds nothing
    await act(async () => {
      net.set(true);
    });
    expect(callback).toHaveBeenCalledTimes(1);


    // The host's own restore reason reaches the same listener
    await act(async () => {
      h.result.current.signalRestore();
    });
    expect(callback).toHaveBeenCalledTimes(2);

    await h.unmount();
  });
});
