import * as crypto from "crypto";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as N3 from "n3";
import { isomorphic } from "rdf-isomorphic";
import * as RDF from "rdf-js";
import * as RdfString from "rdf-string";
import { Readable } from "stream";
import { getDB } from "./db";
import { ComplexError } from "./errors";
import * as models from "./models";
import { Quad, prefix, prefixes } from "./rdf";

const { DataFactory } = N3;
const { namedNode, literal, defaultGraph, quad } = DataFactory;

interface QuadPushable {
  push(q: Quad): void;
}
interface QuadOp {
  op: "add" | "remove";
  q: Quad | StringQuad;
}

type QuadPusher = (s: QuadPushable) => Promise<void>;
export function getRDFStore(source: QuadPusher = pushTopicTuples): Promise<N3.N3Store> {
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

function selectMissing(t1: GraphTrie, t2: GraphTrie): Array<GraphTrie | StringQuad> {
  return Object.keys(t1).flatMap(k => {
    if (t2[k] === undefined || isStringQuad(t1[k]) !== isStringQuad(t2[k])) {
      return t1[k];
    } else if(!isStringQuad(t1[k])) {
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
    return [ g ];
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
    topicBasedStore.getQuads(null, null, null, null),
  );
}

function diffAsQuadOps(orig: Quad[], goal: Quad[]): QuadOp[] {
  const t1 = graphTrie(orig);
  const t2 = graphTrie(goal);

  const remove = selectMissingQuads(t1, t2).map((q: StringQuad): QuadOp => ({
    op: "remove",
    q,
  }));

  const add = selectMissingQuads(t2, t1).map((q: StringQuad): QuadOp => ({
    op: "add",
    q,
  }));

  return [ ...remove, ...add ];
}

interface GraphTrie {
  [key: string]: StringQuad | GraphTrie
}

export function graphTrie(quads: Array<Quad | StringQuad>): GraphTrie {
  const strings = quads.map(stringifyQuad)
  const trie = {} as GraphTrie

  function tier(sq: StringQuad, upper: GraphTrie, field: "subject" | "predicate" | "object" | "graph"): GraphTrie {
    if (!upper[sq[field]]) {
      upper[sq[field]] = {} as GraphTrie
    }
    return upper[sq[field]] as GraphTrie;
  }

  strings.forEach(sq => {
    const gt = tier(sq, trie, "graph");
    const st = tier(sq, gt, "subject");
    const pt = tier(sq, st, "predicate");
    pt[sq.object] = sq;
  });

  return trie;
}

export async function mirrorChangesToRDF(changes: models.DocUpdate[]) {
  const ops = changesToQuadOps(changes);
  await executeQuadOps(ops);

  const match = await tuplesMatchDocs();
  if (!match) {
    console.log("WARNING !! Tuple docs do NOT match the topic docs");
  }
}

function changesToQuadOps(changes: models.DocUpdate[]): QuadOp[] {
  return changes.flatMap((orig: models.DocUpdate): QuadOp[] => {
    // because these operations delete attributes from the objects
    // passed to them
    const change = { ...orig } as models.DocUpdate;

    if (change._deleted) {
      // The caller will have to handle consistency checks before this call because
      // there is no reverse indexed datastore currently
      return deleteTuplesMatchingChange(change);
    } else if (change.patches) {
      const tuples = change.patches.map((p) => updateTuplesFromChange(change, p));

      // This is a new doc
      if (!change._rev) {
        const newQuads = [] as Quad[];
        appendNewDocTuples(change, newQuads);

        newQuads.forEach((q) => {
          tuples.push({ op: "add", q });
        });
      }

      return tuples;
    }

    throw new ComplexError("doc update missing patches and _deleted", {
      change,
    });
  });
}

export async function executeQuadOps(list: QuadOp[]) {
  await list.reduce(async (acc: Promise<void>, qop: QuadOp): Promise<void> => {
    await acc;

    if (qop.op === "add") {
      await uploadQuad(qop.q);
    } else {
      await deleteQuad(qop.q);
    }
  }, Promise.resolve());
}

function deleteTuplesMatchingChange(change: models.DocUpdate): QuadOp[] {
  return topicDocToTuples(change, [] as Quad[]).map((q) => ({
    op: "remove",
    q,
  }));
}

function updateTuplesFromChange(change: models.DocUpdate, p: models.DocChangeEntry): QuadOp {
  const { op, field, value } = p;

  if (field === "props") {
    // TODO implement
    throw new ComplexError("changing props is not currently supported", {
      change,
      p,
    });
  }

  if (typeof value !== "string") {
    // TODO implement
    throw new ComplexError("non-string values are not currently supported", {
      change,
      p,
    });
  }

  return {
    op,
    q: quad(
      refToNode(change.id),
      prefix.s(field),
      quadObject(value),
    ),
  };
}

async function bufferStream(readStream: RDF.Stream): Promise<N3.N3Store> {
  const store = new N3.Store();
  store.import(readStream);
  await promiseEnd(readStream);

  return store;
}

function quadDocID(s: StringQuad): string {
  const stringd = [
    s.subject,
    s.predicate,
    s.object,
    s.graph,
  ].join("!!");
  const hashed = hash(stringd);

  return `$/rdfHashes/${hashed}`;
}

function isObjectQuad(s: Quad | StringQuad): s is Quad {
  return !isStringQuad(s);
}

function isStringQuad(s: GraphTrie | Quad | StringQuad): s is StringQuad {
  return (typeof s.subject === "string") &&
         (typeof s.predicate === "string") &&
         (typeof s.object === "string") &&
         (typeof s.graph === "string")
}

interface StringQuad {
  subject: string;
  predicate: string;
  object: string;
  graph: string;
  [key: string]: string;
}
export function stringifyQuad(q: Quad | StringQuad): StringQuad {
  if (isStringQuad(q)) {
    return q
  } else {
    return {
      subject: RdfString.termToString(q.subject),
      predicate: RdfString.termToString(q.predicate),
      object: RdfString.termToString(q.object),
      graph: RdfString.termToString(q.graph),
    };
  }
}

export async function deleteAllTuples() {
  const db = await getDB();
  const { rows } = await db.allDocs<models.ExistingDoc>({
    include_docs: true,
    startkey: "$/rdfHashes/",
    endkey: "$/rdfHashes/\ufff0",
  });

  const docs = rows.map(({ doc }) => doc).filter((doc) => !!doc);
  const deletes = docs.map((d) => ({ ...d, _deleted: true }));

  await db.bulkDocs(deletes);
}

async function deleteQuad(q: Quad | StringQuad) {
  const db = await getDB();
  const qid = quadDocID(stringifyQuad(q));

  const { _rev } = await db.get(qid).catch(() => ({ }));

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
  q = stringifyQuad(q);
  await db.put({
    _id: quadDocID(q),
    ...q
  }).catch((e) => {
    if (e.status !== 409) {
      throw e;
    }
  });
}

export async function exportToCouchdb(store: N3.N3Store) {
  await store.getQuads(null, null, null, null).reduce(async (p: Promise<void>, q: Quad) => {
    await p;
    await uploadQuad(q);
  }, Promise.resolve());
}

async function exportTrig(readStream: RDF.Stream) {
  const streamWriter = new N3.StreamWriter({
    prefixes,
    format: "application/trig",
  });

  const outputStream = fs.createWriteStream("exports/kb.trig");

  streamWriter.import(readStream);
  streamWriter.pipe(outputStream);

  await promiseEnd(readStream);
}

function promiseEnd(e: EventEmitter): Promise<void> {
  return new Promise((resolve, reject) => {
    e.on("end", () => {
      resolve();
    });
    e.on("error", (err: Error) => {
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
  .catch((err) => {
    stream.emit("error", err);
  });

  return stream;
}

export async function pushCouchTuples(stream: QuadPushable) {
  const db = await getDB();
  const { rows } = await db.allDocs({
    include_docs: true,
    startkey: "$/rdfHashes/",
    endkey: "$/rdfHashes/\ufff0",
  });

  rows.forEach(({ doc }) => {
    if (doc) {
      stream.push(unstringifyQuad(doc));
    }
  });
}

export function unstringifyQuad(json: StringQuad): Quad {
  return quad(
    RdfString.stringToTerm(json.subject) as N3.Quad_Subject,
    RdfString.stringToTerm(json.predicate) as N3.Quad_Predicate,
    RdfString.stringToTerm(json.object) as N3.Quad_Object,
    RdfString.stringToTerm(json.graph) as N3.Quad_Graph,
  );
}

export async function pushTopicTuples(stream: QuadPushable) {
  const db = await getDB();
  const { rows } = await db.allDocs<models.ExistingDoc>({
    include_docs: true,
    startkey: "$/topics/",
    endkey: "$/topics/\ufff0",
  });

  rows.forEach(({ doc }) => {
    if (doc) {
      try {
        topicDocToTuples(doc, stream);
      } catch(cause) {
        throw new ComplexError("failed to convert doc to tuples", {
          cause,
          doc,
        });
      }
    }
  });
}

function appendNewDocTuples(doc: models.DocUpdate, list: QuadPushable ) {
  const { id, created_at, text } = doc;

  list.push(quad(
    refToNode(id),
    prefix.rdf("type"),
    prefix.s("v1Topic"),
  ));

  if (created_at && text) {
    list.push(quad(
      refToNode(id),
      prefix.s("created_at"),
      quadObject(created_at.toString()),
    ));
  }
}

function topicDocToTuples<T extends QuadPushable>(dirty: models.ExistingDoc | models.DocUpdate, list: T): T {
  const { id, created_at } = dirty;
  const doc = models.removeStorageAttributes(dirty);
  const keys = Object.keys(doc);

  appendNewDocTuples(dirty, list);

  fieldTuples(id, doc).forEach(([s,p,o]: [string,string,string]) => {
    list.push(quad(
      refToNode(s),
      prefix.s(p),
      quadObject(o),
    ));
  });

  return list;
}

function fieldTuples(id: string, doc: models.ShortDoc) {
  const rdfList = [] as Array<[string, string, string]>;

  Object.keys(doc).forEach((k: string) => {
    const o: models.DocValueTypes = doc[k];

    if (Array.isArray(o)) {
      (o as models.Link[]).forEach((oNested: models.Link) => listItemToTuples(id, k, oNested, rdfList));
    } else if(models.isProps(k, o)) {
      Object.keys(o).forEach((pk: string) => {
        const opk = o[pk];
        if (opk) {
          rdfList.push([id, pk, opk]);
        }
      });
    } else if(o) {
      rdfList.push([id,k,o.toString()]);
    }
  });

  return rdfList;
}

function listItemToTuples(
  id: string,
  k: string,
  oNested: models.Link,
  rdfList: Array<[string,string,string]>,
) {
  if (typeof oNested === "string") {
    rdfList.push([id,k,oNested]);
  } else if(models.isSearchLink(oNested)) {
    rdfList.push([id,"search",oNested.search]);
  } else if(models.isLabeledLink(oNested)) {
    rdfList.push([id,k,oNested.link]);
    rdfList.push([oNested.link,"title",oNested.title]);
  }
}

function hash(s: string): string {
  const h = crypto.createHash("md5");
  h.update(s);
  return "md5-"+h.digest("hex");
}

function refToNode(v: string): N3.NamedNode {
  if (v.startsWith("/")) {
    const dirty = v.slice(1);
    return prefix.b(dirty);
  } else if (v.match(/[a-z]+:\/\//)) {
    return namedNode(v);
  } else {
    throw new ComplexError("invalid node ID", {
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

function quadObject(v: string): N3.Quad_Object {
  if (v.startsWith("/")) {
    return refToNode(v);
  } else {
    return literal(v);
  }
}
