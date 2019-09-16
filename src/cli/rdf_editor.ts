import * as N3 from 'n3';
import { finalizeEditorStructure } from './editor';
import * as models from '../common/models';
import {
  isNamedNode,
  prefix,
  prefixes,
  termId,
  rdfMatches,
  Quad,
} from '../common/rdf';
import { getRDFStore } from './rdf_dump';
import { DecodedSchema, getFieldType, getSchemaContents } from './schema';
import { timingAsync, timingSync } from './timing';
import { groupBy } from './groupBy';

const { DataFactory } = N3;
const { namedNode } = DataFactory;

export async function buildEditorStructureFromRDF(): Promise<
  models.EditorStructure
> {
  const store = await timingAsync('getRDFStore', () => getRDFStore());
  const schema = await timingAsync('getSchemaContents', () =>
    getSchemaContents()
  );

  const rdfTypeNode = prefix.rdf('type');
  const v1TopicNode = prefix.s('v1Topic');
  const quads = timingSync('storeGetQuads', () =>
    store.getQuads(null, null, null, null)
  );
  const bySubject = groupBy(quads, q => {
    if (isNamedNode(q.subject) && q.subject.value.startsWith(prefixes.b)) {
      return q.subject.value;
    }
  }).filter(pair =>
    pair[1].some(q => rdfMatches(q, null, rdfTypeNode, v1TopicNode))
  );

  const editorDocs = timingSync('brainSubjectsMap', () =>
    bySubject.map(pair => {
      const list = pair[1];
      const id = termId(list[0].subject as N3.NamedNode, prefixes.b);

      const doc = timingSync('buildEditorDocForSubject', () =>
        buildEditorDocForSubject(schema, store, list)
      );
      return [id, doc];
    })
  );

  const basic = Object.fromEntries(editorDocs) as models.EditorStructure;

  finalizeEditorStructure(basic);

  return basic;
}

function buildEditorDocForSubject(
  schema: DecodedSchema,
  store: N3.N3Store,
  nodes: Quad[]
): models.EditorDoc {
  const v1TopicNodes = nodes.filter(
    q => isNamedNode(q.predicate) && q.predicate.value.startsWith(prefixes.s)
  );

  return v1TopicNodes.reduce(
    (acc, q) => {
      const { predicate, object } = q;
      if (!isNamedNode(predicate)) {
        return acc;
      }

      const fieldName = termId(predicate, prefixes.s);
      const fieldType = getFieldType(schema, 'editorNode', fieldName);

      const value = isNamedNode(object)
        ? termId(object, prefixes.b, '/')
        : object.value;

      switch (fieldName) {
        case 'src':
          acc[fieldName] = value;
          break;
        case 'quantity':
        case 'author':
        case 'twitter':
        case 'date':
          acc.props = { [fieldName]: value };
          break;
        case 'search':
          addArrayValue(acc, 'links', {
            search: value,
          });
          break;
        case 'links':
          addLinksArrayValue(store, acc, fieldName, value);
          break;
        default:
          switch (fieldType) {
            case 'string':
              acc[fieldName] = value;
              break;
            case 'array':
              addArrayValue(acc, fieldName, value);
              break;
          }
      }

      return acc;
    },
    {} as models.EditorDoc
  );
}

function addLinksArrayValue(
  store: N3.N3Store,
  acc: models.EditorDoc,
  fieldName: string,
  value: string
) {
  const maybeTitle = store.getQuads(
    namedNode(value),
    prefix.s('title'),
    null,
    null
  )[0];
  if (maybeTitle) {
    addArrayValue(acc, fieldName, {
      link: value,
      title: maybeTitle.object.value,
    });
  } else {
    addArrayValue(acc, fieldName, value);
  }
}

function addArrayValue(
  acc: models.EditorDoc,
  fieldName: string,
  value: models.Link
) {
  if (!acc[fieldName]) {
    acc[fieldName] = [];
  }
  (acc[fieldName] as models.Link[]).push(value);
}
