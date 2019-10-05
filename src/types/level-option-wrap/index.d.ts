declare module 'level-option-wrap' {
  import { AbstractIteratorOptions } from 'abstract-leveldown';
  import { Bytes } from 'leveldown';

  export interface RangeOptionsFunctions<K extends Bytes> {
    [key: string]: (x: K) => K;
  }

  interface Wrapper {
    (
      options: AbstractIteractorOptions,
      fns: RangeOptionsFunctions
    ): AbstractIteratorOptions;
  }

  declare const WrapperFn: Wrapper;
  export default WrapperFn;
}
