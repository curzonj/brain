declare module 'level-auto-index' {
  import { LevelUp } from 'levelup';
  import { AbstractLevelDOWN } from 'abstract-leveldown';

  export type Index<V> = LevelUp<
    AbstractLevelDOWN<string, V>,
    AbstractIterator<string, V>
  >;

  interface AutoindexConstructor<K, V> {
    (
      src: LevelUp<AbstractLevelDOWN<K, V>, AbstractIterator<K, V>>,
      idx: LevelUp,
      reducer: (obj: V) => string | undefined
    ): Index<V>;

    (
      src: LevelUp<AbstractLevelDOWN<K, V>, AbstractIterator<K, V>>,
      idx: LevelUp,
      reducer: (obj: V) => (string | undefined)[],
      options: { multi: true }
    ): Index<V>;
  }

  declare const AutoIndex: AutoindexConstructor;
  export default AutoIndex;
}
