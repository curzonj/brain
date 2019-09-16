declare module 'subleveldown' {
  import { LevelUp } from 'levelup';
  import { AbstractLevelDOWN } from 'abstract-leveldown';

  interface SublevelConstructor {
    <DB extends AbstractLevelDOWN = AbstractLevelDOWN>(
      db: DB,
      scope: string,
      options: any,
      cb?: ErrorCallback
    ): LevelUp<DB>;
  }

  declare const SublevelDown: SublevelConstructor;
  export default SublevelDown;
}
