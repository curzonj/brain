import debug from './debug';

export interface Listener<T> {
  (err: Error | undefined, event: T | undefined): void;
}

export interface Disposable {
  dispose(): void;
}

export class Rendezvous<T> {
  name: string;
  private payload?: T;
  private errorPayload?: Error;
  private event: TypedEvent<T> = new TypedEvent();

  constructor(name: string) {
    this.name = name;
  }

  hasFired = (): boolean =>
    this.payload !== undefined || this.errorPayload !== undefined;
  isPending = () => !this.hasFired();

  once = (listener: Listener<T>): void => {
    if (this.hasFired()) return listener(this.errorPayload, this.payload);
    this.event.once(listener);
  };

  then = async <R>(fn: (v: unknown) => R | PromiseLike<R>): Promise<R> => {
    return new Promise((resolve, reject) => {
      this.once((err, payload) => (err ? reject(err) : resolve(payload)));
    }).then(fn);
  };

  error = (err: Error) => {
    if (this.hasFired()) throw new Error('Rendezvous already fired');

    this.errorPayload = err;
    this.event.error(err);
  };

  done = (payload: T) => {
    if (this.hasFired()) throw new Error('Rendezvous already fired');
    debug.events('eventFired name=%s payload=%O', this.name, payload);

    this.payload = payload;
    this.event.emit(payload);
  };
}

/** passes through events as they happen. You will not get events from before you start listening */
export class TypedEvent<T> {
  private listeners: Listener<T>[] = [];
  private listenersOncer: Listener<T>[] = [];

  on = (listener: Listener<T>): Disposable => {
    this.listeners.push(listener);
    return {
      dispose: () => this.off(listener),
    };
  };

  once = (listener: Listener<T>): void => {
    this.listenersOncer.push(listener);
  };

  off = (listener: Listener<T>) => {
    var callbackIndex = this.listeners.indexOf(listener);
    if (callbackIndex > -1) this.listeners.splice(callbackIndex, 1);
  };

  emit = (event: T) => this.emitBoth(undefined, event);
  error = (err: Error) => this.emitBoth(err, undefined);

  private emitBoth(err: Error | undefined, event: T | undefined) {
    /** Update any general listeners */
    this.listeners.forEach(listener => listener(err, event));

    /** Clear the `once` queue */
    if (this.listenersOncer.length > 0) {
      const toCall = this.listenersOncer;
      this.listenersOncer = [];
      toCall.forEach(listener => listener(err, event));
    }
  }
}
