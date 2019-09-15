import { getDB } from './db';
import { printTimings, timingAsync, timingSync } from './timing';
import * as editor from './editor';
import * as rdfEditor from './rdf_editor';

beforeAll(getDB);
afterAll(printTimings);

describe('editor.ts', () => {
  jest.setTimeout(20000);

  describe('buildEditorStructure', () => {
    it('works', async () => {
      const couchContent = await timingAsync('buildEditorStructure', () =>
        editor.buildEditorStructure()
      );
      const rdfContent = await timingAsync('buildEditorStructureFromRDF', () =>
        rdfEditor.buildEditorStructureFromRDF()
      ).catch(e => {
        console.log(e);
        throw e;
      });

      const rdfKeys = Object.keys(rdfContent).sort();
      const couchKeys = Object.keys(couchContent).sort();

      expect(rdfKeys.length).toEqual(couchKeys.length);

      // This is much faster at printing the error when it fails
      timingSync('compare editor keys', () => {
        rdfKeys.forEach((k, i) => {
          expect(k).toEqual(couchKeys[i]);
          expect(rdfContent[k]).toEqual(couchContent[k]);
        });
      });
    });
  });
});
