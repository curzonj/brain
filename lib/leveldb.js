const levelup = require('levelup');
const leveljs = require('level-js');
const sublevel = require('subleveldown');
const LevelPromise = require('level-promise');

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
};

function base() {
  if (!basedb) {
    basedb = levelup(leveljs('wiki'));
  }

  return basedb;
}
