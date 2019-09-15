import { Command } from '@oclif/command';
import { cli } from 'cli-ux';
import {
  opsToSyncTuplesFromDocs,
  executeQuadOps,
  tuplesMatchDocs,
} from '../cli/rdf_dump';
import { dumpJSON } from '../cli/content';

export default class RdfResetCommand extends Command {
  public async run() {
    const ops = await opsToSyncTuplesFromDocs();

    if (ops.length === 0) {
      console.log('CouchDB tuple documents already match the topic documents');
      return;
    }

    console.log(
      JSON.stringify(
        {
          first: ops[0],
          last: ops[ops.length - 1],
          totalOperations: ops.length,
        },
        null,
        ' '
      )
    );

    const ok = await cli.confirm(
      `Do you want to apply these operations (yes/no)?`
    );
    if (!ok) {
      return;
    }

    await executeQuadOps(ops);
    await dumpJSON();

    const match = await tuplesMatchDocs();
    if (!match) {
      console.log('WARNING !! Tuple docs do NOT match the topic docs');
    }
  }
}
