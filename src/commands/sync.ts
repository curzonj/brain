import { Command } from '@oclif/command';
import { getDB, remote } from '../cli/db';
import { dumpJSON } from '../cli/content';

class SyncCommand extends Command {
  public async run() {
    const db = await getDB();
    await db.sync(remote);
    await dumpJSON();
  }
}

SyncCommand.description = `Replicates CouchDB`;
SyncCommand.flags = {};

module.exports = SyncCommand;
