import PouchDB from 'pouchdb';
import { StringQuad, ValidLiteralType } from './rdf';

export interface Note {
  id: string;
  text: string;
  created_at: number;
  seq: number | string;
  topic_id: string;
}

export interface ShortDoc {
  created_at?: number;
  title?: string;
  text?: string;
  src?: Link;
  link?: Link;
  topic_id?: string;
  queue?: string[];
  related?: string[];
  next?: string[];
  later?: string[];
  list?: string[];
  links?: LinkList;
  props?: DumbProps;
  [key: string]: DocValueTypes;
}

export interface Doc extends ShortDoc {
  id: string;
  created_at?: number;
  patches?: DocChangeEntry[];
  [key: string]: DocValueTypes;
}

export interface DumbProps {
  quanity?: string;
  author?: string;
  [key: string]: string | undefined;
}

export interface DocChangeEntry {
  op: 'add' | 'remove';
  field: string;
  value: ValidLiteralType;
}

export type LinkList = Link[];
export type Link = string | LabeledLink | SearchLink;
export interface SearchLink {
  search: string;
}
export interface LabeledLink {
  title: string;
  link: string;
}
export type EditorArrayItemTypes = Link | MaybeLabeledRef;
export type DocArrayValueTypes = string[] | LinkList;
export type RegularDocValueTypes =
  | string[]
  | string
  | number
  | undefined
  | Link
  | LinkList
  | DumbProps;
export type DocValueTypes = RegularDocValueTypes | DocChangeEntry[];

export type ExistingDoc = PouchDB.Core.ExistingDocument<Doc>;
export type DocUpdate = PouchDB.Core.PutDocument<Doc> & PouchDB.Core.IdMeta;
export type RdfDoc = StringQuad;
export type CouchDocTypes = Doc | RdfDoc | Note;
export type NewNote = PouchDB.Core.PutDocument<Note>;

export interface EditorDoc {
  text?: string;
  queue?: RefList;
  links?: LinkList;
  [key: string]: EditorValueTypes;
}

export interface LabeledRef {
  label: string;
  ref: string;
}

export type EditorValueTypes = RegularDocValueTypes | RefList;
export type RefList = MaybeLabeledRef[];
export type MaybeLabeledRef = string | LabeledRef;
export type EditorStructure = Record<string, EditorDoc>;

export const StorageFields = ['_rev', '_id', '_deleted', 'id', 'patches'];
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

export function isPatches(k: string, v: DocValueTypes): v is DocChangeEntry[] {
  return Array.isArray(v) && k === 'patches';
}

export function isDocArrayField(
  k: string,
  v: DocValueTypes
): v is DocArrayValueTypes {
  return Array.isArray(v) && k !== 'patches';
}

export function isLabeledRef(l: any): l is LabeledRef {
  if (typeof l === 'string') {
    return false;
  }

  return !!(l as LabeledRef).ref;
}

export function isSearchLink(l: any): l is SearchLink {
  if (typeof l === 'string') {
    return false;
  }

  return !!(l as SearchLink).search;
}

export function isLabeledLink(l: any): l is LabeledLink {
  if (typeof l === 'string') {
    return false;
  }

  return !!(l as LabeledLink).link;
}

export function isProps(k: string, o: DocValueTypes): o is DumbProps {
  return k === 'props';
}
