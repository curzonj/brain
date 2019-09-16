declare module 'quadstore' {
  import EncodingDown from 'encoding-down';
  import { LevelUp } from 'levelup';
  import { AbstractLevelDOWN, AbstractIterator } from 'abstract-leveldown';
  import * as RDF from 'rdf-js';

  export interface MatchTerms<T extends string | RDF.Term> {
    subject?: T;
    predicate?: T;
    object?: T;
    graph?: T;
    [key: string]: T;
  }

  export interface StringQuad {
    subject: string;
    predicate: string;
    object: string;
    graph?: string;
    [key: string]: string;
  }

  export class QuadStore<
    Q extends StringQuad = StringQuad,
    T extends string | RDF.Term = string
  > {
    constructor(db: AbstractLevelDOWN<any, any>, options: object);

    get(m: MatchTerms<T>): Promise<Q[]>;
    put(quads: Q[]): Promise<void>;
  }

  export class RdfStore<
    Q extends RDF.BaseQuad = RDF.Quad,
    T extends RDF.Term = RDF.Term
  > extends QuadStore<Q, T> {}
}
