import { renderHook } from '@testing-library/react-native';

import { useChatEngine } from '..';

describe('useChatEngine', () => {
  it('throws a named error outside its provider', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(() => useChatEngine())).rejects.toThrow(/ChatEngineProvider/);
    spy.mockRestore();
  });
});
