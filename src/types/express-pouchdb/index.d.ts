declare module 'express-pouchdb' {
  import PouchDB from 'pouchdb';
  import express from 'express';

  type PouchDBConstructor = new <Content extends {} = {}>(
    name?: string,
    options?: PouchDB.Configuration.DatabaseConfiguration
  ) => PouchDB.Database<Content>;

  interface Config {
    configPath: string;
    mode: string;
    overrideMode: {
      exclude: string[];
    };
  }

  interface ExpressPouchDBHandler extends express.Application {
    couchConfig: any;
  }

  interface ExpressPouchDBConstructor {
    (c: PouchDBConstructor, opts: Config): ExpressPouchDBHandler;
  }

  declare const expressPouchDB: ExpressPouchDBConstructor;
  export default expressPouchDB;
}
