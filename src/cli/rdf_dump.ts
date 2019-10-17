import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as N3 from 'n3';
import { isomorphic } from 'rdf-isomorphic';
import * as RDF from 'rdf-js';
import { Readable } from 'stream';
import { getDB } from './db';
import { ComplexError } from '../common/errors';
import * as models from '../common/models';
import {
  prefix,
  prefixes,
  GraphTrie,
  Quad,
  isStringQuad,
  StringQuad,
  unstringifyQuad,
  stringifyQuad,
  ValidLiteralType,
  isValidLiteralType,
} from '../common/rdf';

const { DataFactory } = N3;
const { namedNode, literal, quad } = DataFactory;

interface QuadPushable {
  push(q: Quad): void;
}
interface QuadOp {
  op: 'add' | 'remove';
  q: Quad | StringQuad;
}

type QuadPusher = (s: QuadPushable) => Promise<void>;
export async function getRDFStore(
  source: QuadPusher = pushTopicTuples
): Promise<N3.N3Store> {
  const readStream = getPushedTupleStream(source);

  return bufferStream(readStream);
}

export async function dumpDatabaseToRDF() {
  const store = await getRDFStore();

  await exportTrig(store.match());
}

export async function tuplesMatchDocs(): Promise<boolean> {
  const topicBasedStore = await getRDFStore();
  const tupleBasedStore = await getRDFStore(pushCouchTuples);

  return isomorphic(
    topicBasedStore.getQuads(null, null, null, null),
    tupleBasedStore.getQuads(null, null, null, null)
  );
}

function selectMissing(
  t1: GraphTrie,
  t2: GraphTrie
): (GraphTrie | StringQuad)[] {
  return Object.keys(t1).flatMap(k => {
    if (t2[k] === undefined || isStringQuad(t1[k]) !== isStringQuad(t2[k])) {
      return t1[k];
    } else if (!isStringQuad(t1[k])) {
      // if it's a StringQuad then they must be equal since they have
      // the same trie keys
      return selectMissing(t1[k] as GraphTrie, t2[k] as GraphTrie);
    } else {
      return [];
    }
  });
}

function allTrieQuads(g: GraphTrie | StringQuad): StringQuad[] {
  if (isStringQuad(g)) {
    return [g];
  }

  return Object.keys(g).flatMap(k => {
    const gk = g[k];
    if (isStringQuad(gk)) {
      return gk;
    } else {
      return allTrieQuads(gk);
    }
  });
}

function selectMissingQuads(t1: GraphTrie, t2: GraphTrie): StringQuad[] {
  const list = selectMissing(t1, t2);

  return list.flatMap(allTrieQuads);
}

export async function opsToSyncTuplesFromDocs(): Promise<QuadOp[]> {
  const topicBasedStore = await getRDFStore();
  const tupleBasedStore = await getRDFStore(pushCouchTuples);

  return diffAsQuadOps(
    tupleBasedStore.getQuads(null, null, null, null),
    topicBasedStore.getQuads(null, null, null, null)
  );
}

function diffAsQuadOps(orig: Quad[], goal: Quad[]): QuadOp[] {
  const t1 = graphTrie(orig);
  const t2 = graphTrie(goal);

  const remove = selectMissingQuads(t1, t2).map(
    (q: StringQuad): QuadOp => ({
      op: 'remove',
      q,
    })
  );

  const add = selectMissingQuads(t2, t1).map(
    (q: StringQuad): QuadOp => ({
      op: 'add',
      q,
    })
  );

  return [...remove, ...add];
}

export function graphTrie(quads: (Quad | StringQuad)[]): GraphTrie {
  const strings = quads.map(stringifyQuad);
  const trie = {} as GraphTrie;

  function tier(
    sq: StringQuad,
    upper: GraphTrie,
    field: 'subject' | 'predicate' | 'object' | 'graph'
  ): GraphTrie {
    const k = sq[field] || '';

    if (!upper[k]) {
      upper[k] = {} as GraphTrie;
    }
    return upper[k] as GraphTrie;
  }

  strings.forEach(sq => {
    const gt = tier(sq, trie, 'graph');
    const st = tier(sq, gt, 'subject');
    const pt = tier(sq, st, 'predicate');
    pt[sq.object] = sq;
  });

  return trie;
}

export async function executeQuadOps(list: QuadOp[]) {
  await list.reduce(async (acc: Promise<void>, qop: QuadOp): Promise<void> => {
    await acc;

    if (qop.op === 'add') {
      await uploadQuad(qop.q);
    } else {
      await deleteQuad(qop.q);
    }
  }, Promise.resolve());
}

async function bufferStream(readStream: RDF.Stream): Promise<N3.N3Store> {
  const store = new N3.Store();
  store.import(readStream);
  await promiseEnd(readStream);

  return store;
}

function quadDocID(s: StringQuad): string {
  const stringd = [s.subject, s.predicate, s.object, s.graph].join('!!');
  const hashed = hash(stringd);

  return `$/rdfHashes/${hashed}`;
}

export async function deleteAllTuples() {
  const db = await getDB();
  const { rows } = await db.allDocs<models.ExistingDoc>({
    include_docs: true,
    startkey: '$/rdfHashes/',
    endkey: '$/rdfHashes/\ufff0',
  });

  const docs = rows.map(({ doc }) => doc).filter(doc => !!doc);
  const deletes = docs.map(d => ({ ...d, _deleted: true }));

  await db.bulkDocs(deletes);
}

async function deleteQuad(q: Quad | StringQuad) {
  const db = await getDB();
  const qid = quadDocID(stringifyQuad(q));

  const { _rev } = await db.get(qid).catch(() => ({}));

  if (!_rev) {
    return;
  }

  await db.put({
    _id: qid,
    _rev,
    _deleted: true,
  });
}

async function uploadQuad(q: Quad | StringQuad) {
  const db = await getDB();
  const sq = stringifyQuad(q);
  await db
    .put({
      _id: quadDocID(sq),
      ...sq,
    })
    .catch(e => {
      if (e.status !== 409) {
        throw e;
      }
    });
}

export async function exportToCouchdb(store: N3.N3Store) {
  await store
    .getQuads(null, null, null, null)
    .reduce(async (p: Promise<void>, q: Quad) => {
      await p;
      await uploadQuad(q);
    }, Promise.resolve());
}

async function exportTrig(readStream: RDF.Stream) {
  const streamWriter = new N3.StreamWriter({
    prefixes,
    format: 'application/trig',
  });

  const outputStream = fs.createWriteStream('exports/kb.trig');

  streamWriter.import(readStream);
  streamWriter.pipe(outputStream);

  await promiseEnd(readStream);
}

async function promiseEnd(e: EventEmitter): Promise<void> {
  return new Promise((resolve, reject) => {
    e.on('end', () => {
      resolve();
    });
    e.on('error', (err: Error) => {
      reject(err);
    });
  });
}

function getPushedTupleStream(source: QuadPusher): RDF.Stream {
  const stream = new Readable({
    objectMode: true,
    read() {},
  });

  source(stream)
    .then(() => {
      stream.push(null);
    })
    .catch(err => {
      stream.emit('error', err);
    });

  return stream;
}

export async function pushCouchTuples(stream: QuadPushable) {
  const db = await getDB();
  const { rows } = await db.allDocs({
    include_docs: true,
    startkey: '$/rdfHashes/',
    endkey: '$/rdfHashes/\ufff0',
  });

  rows.forEach(({ doc }) => {
    if (doc) {
      stream.push(unstringifyQuad(doc));
    }
  });
}

export async function pushTopicTuples(stream: QuadPushable) {
  const db = await getDB();
  const { rows } = await db.allDocs<models.ExistingDoc>({
    include_docs: true,
    startkey: '$/topics/',
    endkey: '$/topics/\ufff0',
  });

  rows.forEach(({ doc }) => {
    if (doc) {
      try {
        topicDocToTuples(doc, stream);
      } catch (cause) {
        throw new ComplexError('failed to convert doc to tuples', {
          cause,
          doc,
        });
      }
    }
  });
}

function appendNewDocTuples(doc: models.DocUpdate): Quad[] {
  return [quad(refToNode(doc.id), prefix.rdf('type'), prefix.s('v1Topic'))];
}

type SimpleTuple = [string, string, ValidLiteralType];

function topicDocToTuples<T extends QuadPushable>(
  dirty: models.ExistingDoc | models.DocUpdate,
  list: T
): T {
  const { id } = dirty;
  const doc = models.removeStorageAttributes(dirty);

  appendNewDocTuples(dirty).forEach(q => list.push(q));

  fieldTuples(id, doc).forEach(([s, p, o]: SimpleTuple) => {
    list.push(quad(refToNode(s), prefix.s(p), quadObject(o)));
  });

  return list;
}

function fieldTuples(id: string, doc: models.ShortDoc): SimpleTuple[] {
  const rdfList = [] as SimpleTuple[];

  Object.keys(doc).forEach((k: string) => {
    const o: models.DocValueTypes = doc[k];

    if (Array.isArray(o)) {
      (o as models.Link[]).forEach((oNested: models.Link) =>
        listItemToTuples(id, k, oNested, rdfList)
      );
    } else if (models.isProps(k, o)) {
      Object.keys(o).forEach((pk: string) => {
        const opk = o[pk];
        if (opk) {
          rdfList.push([id, pk, opk]);
        }
      });
    } else if (isValidLiteralType(o)) {
      rdfList.push([id, k, o]);
    } else {
      throw new ComplexError('unable to generate tuple for object', {
        id,
        k,
        o,
      });
    }
  });

  return rdfList;
}

function listItemToTuples(
  id: string,
  k: string,
  oNested: models.Link,
  rdfList: SimpleTuple[]
) {
  if (isValidLiteralType(oNested)) {
    rdfList.push([id, k, oNested]);
  } else if (models.isSearchLink(oNested)) {
    rdfList.push([id, 'search', oNested.search]);
  } else if (models.isLabeledLink(oNested)) {
    rdfList.push([id, k, oNested.link]);
    rdfList.push([oNested.link, 'title', oNested.title]);
  }
}

function hash(s: string): string {
  const h = crypto.createHash('md5');
  h.update(s);
  return 'md5-' + h.digest('hex');
}

function refToNode(v: string): N3.NamedNode {
  if (v.startsWith('/')) {
    const dirty = v.slice(1);
    return prefix.b(dirty);
  } else if (v.match(/[a-z]+:\/\//)) {
    return namedNode(v);
  } else {
    throw new ComplexError('invalid node ID', {
      v,
    });
  }
  /*
  let clean = (dirty.match(/[.\/ ]/))
    ? hash(dirty)
    : dirty;

  if (clean.match(/^[0-9]/)) {
    const numType = (clean.length === 32)
      ? "md5-"
      : "num-";

    clean = numType+clean;
  }

  return prefix.b(clean);
   */
}

function quadObject(v: ValidLiteralType): N3.Quad_Object {
  if (typeof v === 'string' && v.startsWith('/')) {
    return refToNode(v);
  } else {
    return literal(v);
  }
}
