export class ComplexError extends Error {
  constructor(message: string, details: object) {
    super(message);
    // Ensure the name of this error is the same as the class name
    this.name = this.constructor.name;
    // This clips the constructor invocation from the stack trace.
    // It's not absolutely essential, but it does make the stack trace a little nicer.
    //  @see Node.js reference (bottom)
    Error.captureStackTrace(this, this.constructor);

    Object.assign(this, details);
  }
}

export function wrapAsync(fn: () => Promise<void>) {
  Promise.resolve()
    .then(fn)
    .catch(e => {
      console.error(e);
    });
}
