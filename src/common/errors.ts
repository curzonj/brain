export class ComplexError extends Error {
  details: any;
  cause?: Error;

  constructor(message: string | Error, details: any = {}) {
    if (
      message instanceof Error ||
      (typeof message !== 'string' && (message as any).message)
    ) {
      (details as any).cause = message;
      message = (details as any).cause.message;
    }

    super(message as string);
    // Ensure the name of this error is the same as the class name
    this.name = this.constructor.name;

    if (details.cause) {
      this.cause = details.cause;
      if (details.cause.name) this.name = details.cause.name;
      delete details.cause;
    }

    if (details.stack && this.stack) {
      if (details.stack instanceof Error) {
        details.stack = details.stack.stack;
      }

      const detailsStack = details.stack.split('\n').slice(1);
      const stackMessage = this.stack.split('\n')[0];
      delete details.stack;

      this.stack = [stackMessage, ...detailsStack].join('\n');
    } else if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    this.details = surfaceDetails(this.cause);
    for (const k in details) {
      if (!this.details[k]) this.details[k] = details[k];
    }
  }
}

function surfaceDetails(cause: any): object {
  if (!cause) {
    return {};
  }

  const lowest: any = surfaceDetails(cause.cause);
  if (cause.details) {
    for (const k in cause.details) {
      if (!lowest[k]) lowest[k] = cause.details[k];
    }
  }

  return lowest;
}

export function wrapAsync(fn: () => Promise<void>) {
  Promise.resolve()
    .then(fn)
    .catch(e => {
      console.error(e);
    });
}

export async function annotateErrors<T>(
  obj: any,
  fn: () => Promise<T>
): Promise<T> {
  return fn().catch(e => {
    if (!(e instanceof ComplexError)) {
      e = new ComplexError(e, obj);
    }

    throw e;
  });
}

export function catchError(fn: () => any, opts: any = {}) {
  Promise.resolve()
    .then(fn)
    .catch(e => reportError(e, opts));
}

interface ErrorFields extends Error {
  cause?: { stack?: any };
  details?: any;
}
export function reportError(err: ErrorFields, opts: any = {}) {
  if (err instanceof ComplexError) {
    Object.assign(err.details, opts);
  } else {
    err = new ComplexError(err, opts);
  }
  console.error(err);
  if (err.cause && err.cause.stack) {
    console.log(err.cause.stack);
  }
  console.log(err.details);
}
