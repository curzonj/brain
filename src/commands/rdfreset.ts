import { Command } from '@oclif/command';
import { deleteAllTuples } from '../cli/rdf_dump';
import { dumpJSON } from '../cli/content';

export default class RdfResetCommand extends Command {
  public async run() {
    await deleteAllTuples();
    await dumpJSON();
  }
}
