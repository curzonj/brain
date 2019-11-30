import { useState } from 'react';
import { reportError } from '../../common/errors';

interface AsyncState<T, V> {
  params?: V;
  result?: T;
}
export function useAsync<T, V>(
  params: V,
  fn: (params: V, cb: (result: T) => void) => Promise<void | T>
): T | undefined {
  const [state, setState] = useState<AsyncState<T, V>>({});
  if (state && state.params === params && state.result) return state.result;
  reportError(async () => {
    const ret: void | T = await fn(params, result =>
      setState({ params, result })
    );
    if (ret) setState({ params, result: ret } as AsyncState<T, V>);
  });
}
