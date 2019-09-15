declare module 'quadstore' {
  import EncodingDown from 'encoding-down';
  import { LevelUp } from 'levelup';
  import { AbstractLevelDOWN, AbstractIterator } from 'abstract-leveldown';

  export interface Quad {
    subject: string;
    predicate: string;
    object: string;
    graph?: string;
  }

  export class QuadStore {
    public constructor(db: AbstractLevelDOWN<any, any>, options: object);

    public put(quads: Quad[]): Promise<void>;
  }
}
