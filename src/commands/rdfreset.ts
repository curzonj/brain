import { Command } from '@oclif/command';
import { deleteAllTuples } from '../cli/rdf_dump';

export default class RdfResetCommand extends Command {
  public async run() {
    await deleteAllTuples();
  }
}
