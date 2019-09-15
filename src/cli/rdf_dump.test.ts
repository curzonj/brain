import * as N3 from 'n3';
import { getDB } from './db';
import { printTimings } from './timing';
import * as rdfDump from './rdf_dump';

const { DataFactory } = N3;
const { namedNode, literal, quad } = DataFactory;

beforeAll(getDB);
afterAll(printTimings);

describe('rdf_dump.ts', () => {
  jest.setTimeout(20000);

  describe('graphTrie', () => {
    it('works', async () => {
      const list = [
        quad(namedNode('s1'), namedNode('p1'), literal('text')),
        quad(namedNode('s1'), namedNode('p2'), literal('text')),
        quad(namedNode('s2'), namedNode('p2'), literal('text')),
        quad(namedNode('s3'), namedNode('p3'), literal('text')),
        quad(namedNode('s3'), namedNode('p3'), literal('other')),
      ] as N3.Quad[];

      const strings = list.map(rdfDump.stringifyQuad);

      const t = rdfDump.graphTrie(strings);

      expect(t).toEqual({
        '': {
          s1: {
            p1: {
              '"text"': strings[0],
            },
            p2: {
              '"text"': strings[1],
            },
          },
          s2: {
            p2: {
              '"text"': strings[2],
            },
          },
          s3: {
            p3: {
              '"text"': strings[3],
              '"other"': strings[4],
            },
          },
        },
      });
    });
  });
});
