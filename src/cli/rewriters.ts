import * as models from '../common/models';
import { hash, generatePatches, topicToDocID } from './content';

type Rewriter = (
  d: models.DocUpdate,
  docs: models.AllDocsHash,
  original: models.ExistingDoc
) => models.DocUpdate[] | models.DocUpdate | undefined;
interface RewriterSet {
  [key: string]: Rewriter;
}

export const rewriters: RewriterSet = {
  removeIdSlashes(doc) {
    function replace(item: string) {
      if (!item.startsWith('/')) return item;
      if (item.match(/^\/[a-zA-Z0-9-_.]+$/)) return item;
      return `/${hash(item.slice(1))}`;
    }

    function inner(field: string) {
      const list: any = doc[field];
      if (!Array.isArray(list)) return;
      doc[field] = (list as string[]).map(replace);
    }
    ['queue', 'next', 'later', 'list', 'related'].forEach(inner);

    if (doc.src && typeof doc.src === 'string') doc.src = replace(doc.src);
    if (doc.props && doc.props.author) {
      const related = (doc.related = doc.related || []);
      related.push(replace(doc.props.author));
      delete doc.props;
    }

    const newId = replace(doc.id);
    if (newId === doc.id) {
      return doc;
    }

    const newDoc = {
      ...doc,
      id: newId,
      _id: topicToDocID(newId),
    } as models.DocUpdate;
    delete newDoc._rev;

    generatePatches({}, newDoc);

    return [newDoc, { ...doc, _deleted: true } as models.DocUpdate];
  },
};

/*
 * The fields are gone now so these don't compile, but they are good reference material
 *
restoreRelated(d, allDocs) {
  if (d.title || d.related) return;

  const result = Object.values(allDocs)
    .filter(other =>
      ['next', 'later', 'list', 'related', 'queue'].some(
        field => other[field] && (other[field] as string[]).indexOf(d.id) > -1
      )
    )
    .map(d => d.id);

  if (result.length > 0) {
    d.related = result;
    return d;
  }
},
unstackLists(d, allDocs, original) {
  const updates: models.DocUpdate[] = [d];
  unstackNestedDocuments(d, updates);

  if (deepEqual(original, d)) return;

  generatePatches(original, d);

  return updates;
},
removeMentions(d) {
  if (d.mentions) {
    const r = (d.related = d.related || []);
    d.mentions.forEach(m => r.push(m));
    delete d.mentions;
    return d;
  }
},
removeJoins(d, allDocs) {
  if (d.join) {
    const joinedDoc = allDocs[d.join];
    if (joinedDoc) {
      const title = joinedDoc.title;
      const r = (d.related = d.related || []);
      r.push(d.join);
      d.title = title;
    }

    delete d.join;
    return d;
  }
},
removeContext(d) {
  if (d.context) {
    const r = (d.related = d.related || []);
    if (r.indexOf(d.context) === -1) r.push(d.context);

    delete d.context;
    return d;
  }
},
 */
