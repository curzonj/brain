import PouchDB from 'pouchdb';

export type Link = string | SearchLink | Ref;
export interface SearchLink {
  search: string;
}
export interface Ref {
  stale?: boolean;
  label?: string;
  ref: string;
}

export interface DumbProps {
  quanity?: string;
  twitter?: string;
  date?: string;
}
export interface TopicFields {
  title?: string;
  link?: string;
  aka?: string[];
  links?: Link[];
  src?: string | Ref;
  type?: Ref;
  text?: string;
  related?: Ref[];
  broader?: Ref[];
  actionOn?: Ref[];
  narrower?: Ref[];
  props?: DumbProps;
}

export type Topic = TopicFields & {
  collection?: Ref[];
};
export type TopicKeys = keyof Topic;

export interface TopicMetadata {
  id: string;
  created_at: number;
  stale_at?: number;
  nextAction?: Ref;
  firstAction?: boolean;
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

export function getAllRefs<T extends TopicFields>(
  doc: T,
  excludeDeprecated: boolean = false
): Ref[] {
  return Object.keys(doc).flatMap(key => {
    const item = (doc as any)[key];
    //if (excludeDeprecated && [].indexOf(key) > -1) return [];
    return [item].flat().filter(isRef);
  });
}

export function uniqueRefs(list: Ref[]): Ref[] {
  const hash: Record<string, Ref> = list.reduce(
    (acc, ref) => {
      acc[ref.ref] = ref;
      return acc;
    },
    {} as Record<string, Ref>
  );

  return Object.values(hash);
}

export function isRef(l: any): l is Ref {
  if (l === undefined) return false;
  if (typeof l === 'string') return false;
  return typeof (l as Ref).ref === 'string';
}

export function hasRef(
  list: undefined | Payload[] | Ref[],
  r: Payload | Ref | string
): boolean {
  if (!list) return false;
  const idList: string[] = (list as (Payload | Ref)[]).map((l: Payload | Ref) =>
    isRef(l) ? l.ref : l.metadata.id
  );
  const id: string = isRef(r)
    ? r.ref
    : typeof r === 'string'
    ? r
    : r.metadata.id;
  return idList.indexOf(id) > -1;
}
