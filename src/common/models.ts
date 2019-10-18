import PouchDB from 'pouchdb';

export interface Note {
  id: string;
  text: string;
  created_at: number;
  seq: number | string;
  topic_id: string;
  broader: string[];
  title: undefined;
  src: undefined;
}

export interface ShortDoc {
  title?: string;
  link?: string;
  aka?: string[];
  links?: Link[];
  src?: string | Ref;
  text?: string;
  related?: Ref[];
  broader?: Ref[];
  isA?: Ref[];
  narrower?: Ref[];
  collection?: Ref[];
  next?: Ref[];
  later?: Ref[];
  props?: DumbProps;
  topic_id?: string; // look at removing this
  [key: string]: DocValueTypes;
}

export interface Doc extends ShortDoc {
  id: string;
  created_at?: number;
  stale_at?: number;
}

export interface DumbProps {
  quanity?: string;
  twitter?: string;
  date?: string;
}

export type Link = string | SearchLink | Ref;
export interface SearchLink {
  search: string;
}
export type DocValueTypes =
  | Ref[]
  | string
  | number
  | undefined
  | boolean
  | Link
  | Link[]
  | DumbProps;

export type CouchDocTypes = Doc | Note;
export type ExistingDoc = PouchDB.Core.ExistingDocument<Doc>;
export type DocUpdate = PouchDB.Core.PutDocument<Doc> & PouchDB.Core.IdMeta;
export type NewNote = PouchDB.Core.PutDocument<Note>;

export interface EditorDoc extends ShortDoc {
  stale?: true;
  notes?: Ref[];
  backrefs?: Ref[];
  quotes?: Ref[];
}

export interface Ref {
  label?: string;
  ref: string;
}

export type EditorStructure = Record<string, EditorDoc>;
export type AllDocsHash = Record<string, ExistingDoc>;

export const StorageFields = ['_rev', '_id', '_deleted', 'id'];
export function removeStorageAttributes(
  doc: ExistingDoc | DocUpdate
): ShortDoc {
  const clone = { ...doc } as any;

  StorageFields.forEach(k => {
    delete clone[k];
  });

  return clone as ShortDoc;
}

export function isStorageField(k: string) {
  return StorageFields.indexOf(k) > -1;
}

export function isRef(l: any): l is Ref {
  if (l === undefined) return false;
  if (typeof l === 'string') return false;
  return typeof (l as Ref).ref === 'string';
}

export function isSearchLink(l: any): l is SearchLink {
  if (typeof l === 'string') {
    return false;
  }

  return typeof (l as SearchLink).search === 'string';
}

export function isProps(k: string, o: DocValueTypes): o is DumbProps {
  return k === 'props';
}
