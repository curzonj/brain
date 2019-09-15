import * as N3 from "n3";

const { DataFactory } = N3;
const { namedNode, literal, defaultGraph, quad } = DataFactory;

export type Quad = N3.Quad;

export const prefixes = {
  b: "https://curzonj.github.io/brain/#",
  s: "https://curzonj.github.io/rdf/schema#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
} as { [key: string]: string };

interface Prefixers {
  [key: string]: (v: string) => N3.NamedNode;
}
export const prefix: Prefixers = Object.keys(prefixes).reduce((acc, k: string) => {
  acc[k] = (v: string) => namedNode(prefixes[k] + v);
  return acc;
}, {} as Prefixers);

export function isNamedNode(t: N3.Term): t is N3.NamedNode {
  return t.termType === "NamedNode";
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

export function termId(t: N3.NamedNode, pre: string, postfix: string = ""): string {
  if (t.value.startsWith(pre)) {
    return postfix+t.value.slice(pre.length);
  }

  return t.value;
}
