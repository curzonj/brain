import * as N3 from 'n3';
import * as QuadStore from 'quadstore';
import * as RdfString from 'rdf-string';

const { DataFactory } = N3;
const { namedNode, quad } = DataFactory;

export type Quad = N3.Quad;
export type StringQuad = QuadStore.StringQuad;

export interface GraphTrie {
  [key: string]: StringQuad | GraphTrie;
}

export function isObjectQuad(s: Quad | StringQuad): s is Quad {
  return !isStringQuad(s);
}

export function isStringQuad(
  s: GraphTrie | Quad | StringQuad
): s is StringQuad {
  return (
    typeof s.subject === 'string' &&
    typeof s.predicate === 'string' &&
    typeof s.object === 'string' &&
    typeof s.graph === 'string'
  );
}

export function stringifyQuad(q: Quad | StringQuad): StringQuad {
  if (isStringQuad(q)) {
    return q;
  } else {
    return {
      subject: RdfString.termToString(q.subject),
      predicate: RdfString.termToString(q.predicate),
      object: RdfString.termToString(q.object),
      graph: RdfString.termToString(q.graph),
    };
  }
}
export function unstringifyQuad(json: StringQuad): Quad {
  return quad(
    RdfString.stringToTerm(json.subject) as N3.Quad_Subject,
    RdfString.stringToTerm(json.predicate) as N3.Quad_Predicate,
    RdfString.stringToTerm(json.object) as N3.Quad_Object,
    RdfString.stringToTerm(json.graph || '') as N3.Quad_Graph
  );
}

export const prefixes = {
  b: 'https://curzonj.github.io/brain/#',
  s: 'https://curzonj.github.io/rdf/schema#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
} as { [key: string]: string };

interface Prefixers {
  [key: string]: (v: string) => N3.NamedNode;
}
export const prefix: Prefixers = Object.keys(prefixes).reduce(
  (acc, k: string) => {
    acc[k] = (v: string) => namedNode(prefixes[k] + v);
    return acc;
  },
  {} as Prefixers
);

export function isNamedNode(t: N3.Term): t is N3.NamedNode {
  return t.termType === 'NamedNode';
}

export function rdfMatches(
  candidate: Quad,
  s: N3.Quad_Subject | null,
  p: N3.Quad_Predicate | null,
  o: N3.Quad_Object | null
): boolean {
  return (
    (s === null || s.equals(candidate.subject)) &&
    (p === null || p.equals(candidate.predicate)) &&
    (o === null || o.equals(candidate.object))
  );
}

export function termId(
  t: N3.NamedNode,
  pre: string,
  postfix: string = ''
): string {
  if (t.value.startsWith(pre)) {
    return postfix + t.value.slice(pre.length);
  }

  return t.value;
}

// must match the type signature of N3.DataFactory.literal
export type ValidLiteralType = number | string;
export function isValidLiteralType(v: any): v is ValidLiteralType {
  return typeof v === 'string' || typeof v === 'number';
}
