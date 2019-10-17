import { deepEqual } from 'fast-equals';
import * as models from '../common/models';
import { hash, topicToDocID } from './content';

type Rewriter = (
  d: models.DocUpdate,
  docs: models.AllDocsHash,
  original: models.ExistingDoc
) => models.DocUpdate[] | models.DocUpdate | undefined;
interface RewriterSet {
  [key: string]: Rewriter;
}

export const rewriters: RewriterSet = {
  remove(doc) {
    delete doc.patches;
    delete doc.queue;
    return doc;
  },
};

/*
 * The fields are gone now so these don't compile, but they are good reference material
 *
fixQueues(doc, allDocs) {
  if (doc.stale_at !== undefined || !doc.text || !doc.related) return;
  const newRelated = [
    doc.related.filter(id => {
      const target = allDocs[id];
      if (!target) return false;
      if (id === '/inbox' && doc.related && doc.related.length > 1)
        return false;
      return true;
    }),
    Object.keys(allDocs).filter(k => {
      const target = allDocs[k];
      if (
        ['queue', 'list', 'next', 'later'].some(
          f => target[f] && (target[f] as string[]).indexOf(doc.id) > -1
        )
      )
        return true;
      if (target.src && target.src === doc.id) return true;
      return false;
    }),
  ]
    .flat()
    .filter((v, i, s) => s.indexOf(v) === i);

  if (deepEqual(doc.related.sort(), newRelated.sort())) return;

  doc.related = newRelated;
  return doc;
},
reconcileCreatedAt(doc) {
  if (doc.created_at && doc.text === undefined) {
    delete doc.created_at;
    return doc;
  }
},
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

  return [newDoc, { ...doc, _deleted: true } as models.DocUpdate];
},
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
