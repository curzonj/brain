declare module 'batchlevel' {
  import { LevelUp } from 'levelup';
  import { AbstractLevelDOWN, ErrorCallback } from 'abstract-leveldown';

  interface BatchedLevelDB<DB> extends LevelUp<DB> {
    write(cb: ErrorCallback);
  }

  interface BatchlevelConstructor {
    <DB extends AbstractLevelDOWN = AbstractLevelDOWN>(
      db: LevelUp<DB>
    ): BatchedLevelDB<DB>;
  }

  declare const BatchlevelDown: BatchlevelConstructor;
  export default BatchlevelDown;
}
