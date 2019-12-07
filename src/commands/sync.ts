import { Command } from '@oclif/command';
import { syncPhase } from '../cli/content';

class SyncCommand extends Command {
  public async run() {
    await syncPhase();
  }
}

SyncCommand.description = `Replicates CouchDB`;
SyncCommand.flags = {};

module.exports = SyncCommand;
