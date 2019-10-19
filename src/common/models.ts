import PouchDB from 'pouchdb';

export type Link = string | SearchLink | Ref;
export interface SearchLink {
  search: string;
}
export interface Ref {
  label?: string;
  ref: string;
}

export interface DumbProps {
  quanity?: string;
  twitter?: string;
  date?: string;
}

export type FieldTypes =
  | Ref[]
  | string
  | undefined
  | boolean
  | Link
  | Link[]
  | DumbProps;

export interface TopicFields {
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
  props?: DumbProps;
}

export type Topic = TopicFields & {
  collection?: Ref[];
  next?: Ref[];
  later?: Ref[];
  //[key: string]: FieldTypes; // BURN IT
};
export type TopicKeys = keyof Topic;

export interface ReverseMappings {
  notes?: Ref[];
  backrefs?: Ref[];
  quotes?: Ref[];
}
export type EditorRefInput = Ref | string | EditorTopic;
export interface EditorTopic extends TopicFields {
  stale?: true;
  collection?: EditorRefInput[];
  next?: EditorRefInput[];
  later?: EditorRefInput[];
  notes?: EditorRefInput[];
  backrefs?: Ref[];
  quotes?: Ref[];
  //[key: string]: FieldTypes | EditorRefInput[];
}
export type EditorTopicKeys = keyof EditorTopic;

export interface TopicMetadata {
  id: string;
  created_at: number;
  stale_at?: number;
}

export interface Payload {
  topic: Topic;
  metadata: TopicMetadata;
}

export type Existing<T = Payload> = PouchDB.Core.ExistingDocument<T>;
export type Update<T = Payload> = PouchDB.Core.PutDocument<T> &
  PouchDB.Core.IdMeta;
export type Create<T = Payload> = PouchDB.Core.PutDocument<T>;
export type Map<T> = Record<string, T>;

export function getAllRefs<T extends TopicFields>(doc: T): Ref[] {
  return Object.values(doc).flatMap(item => [item].flat().filter(isRef));
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

export function isProps(k: string, o: FieldTypes): o is DumbProps {
  return k === 'props';
}
