import { useEffect, useState } from 'react';
import { deepEqual } from 'fast-equals';
import { reportError } from '../../common/errors';
import { debounce, DebounceSettings } from 'lodash';
import { debug as debugLib } from 'debug';

const debug = debugLib('kbase:use_async');

interface AsyncState<T, V> {
  params?: V;
  result?: T;
  fn: (params: V, cb: (result: T | void) => void) => void;
}

export interface ExtraOptions {
  wait: number;
  fuzzy: boolean;
}
export function useAsync<T, V>(
  params: V,
  fn: (params: V, cb: (result: T | void) => void) => Promise<void | T>,
  debounceSettings: DebounceSettings & ExtraOptions = {
    fuzzy: false,
    wait: 200,
    leading: true,
  }
): T | undefined {
  function inner(params: V, cb: (ret: T | void) => void) {
    reportError(async () => {
      cb(await fn(params, cb));
    });
  }
  const { wait, fuzzy } = debounceSettings;
  const [state, setState] = useState<AsyncState<T, V>>({
    fn: debounce(inner, wait, debounceSettings),
  });
  const debouncedFn = state.fn;
  const previousResultForComparison = fuzzy ? state.result : undefined;

  useEffect(() => {
    let isActive = true;
    (debouncedFn as any).cancel();
    debouncedFn(params, (result: T | void) => {
      if (!isActive || !result) return;
      const isEqual = previousResultForComparison
        ? deepEqual(result, previousResultForComparison)
        : false;
      debug('params=%O result=%O changed=%o', params, result, !isEqual);
      if (isEqual) return;
      setState({ fn: debouncedFn, params, result });
    });
    return () => {
      isActive = false;
    };
  }, [debouncedFn, params, previousResultForComparison]);

  if (fuzzy || state.params === params) return state.result;
}
