const levelup = require('levelup');
const leveljs = require('level-js');
const sublevel = require('subleveldown');
const LevelPromise = require('level-promise');
const { RdfStore } = require('quadstore');
const N3 = require('n3');

const { DataFactory } = N3;

let basedb;
const dbList = {};

module.exports = {
  base,
  nested(db, name) {
    return LevelPromise(sublevel(db, name, { valueEncoding: 'id' }));
  },

  sublevel(name) {
    if (!dbList[name]) {
      dbList[name] = LevelPromise(
        sublevel(base(), name, { valueEncoding: 'id' })
      );
    }

    return dbList[name];
  },
  rdfStore: new RdfStore(leveljs('rdf'), {
    dataFactory: DataFactory,
  })
};

function base() {
  if (!basedb) {
    basedb = levelup(leveljs('wiki'));
  }

  return basedb;
}
