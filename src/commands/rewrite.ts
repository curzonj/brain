import { Command, flags } from '@oclif/command';
import { cli } from 'cli-ux';
import { cloneDeep } from 'lodash';
import { deepEqual } from 'fast-equals';
import { schemaSelector } from '../cli/schema';
import { applyChanges, getAllDocsHash } from '../cli/content';
import * as models from '../common/models';
import { setupRewriters, rewriters } from '../cli/rewriters';

const couchDbSchema = schemaSelector('payload');

class RewriteCommand extends Command {
  async run() {
    const { args, flags: flagArgs } = this.parse(RewriteCommand);

    const rewriter = rewriters[args.script];
    if (rewriter === undefined) {
      throw new Error('no such rewriter');
    }

    const allDocs = await getAllDocsHash();
    const opts = await setupRewriters(allDocs);
    const modified: models.Update[] = [];

    for (let doc of Object.values(allDocs)) {
      const theClone = cloneDeep(doc);
      const result = rewriter(theClone, opts) || theClone;

      if (Array.isArray(result)) {
        if (result.length === 0) continue;
      } else if (deepEqual(doc, result)) {
        continue;
      }

      const flatResult = [result].flat();
      flatResult.forEach(r => {
        if (!couchDbSchema(r)) {
          console.log(
            JSON.stringify(
              { doc, result, errors: couchDbSchema.errors },
              null,
              ' '
            )
          );

          if (!flagArgs.force) {
            return;
          }
        }
        modified.push(r);
      });
    }

    if (modified.length === 0) {
      console.log('No documents modified');
      return;
    }

    if (flagArgs.dry) {
      console.log(`Modified ${modified.length} documents. Dry run only.`);
      return;
    }

    const ok = await cli.confirm(
      `Modified ${modified.length} documents. Upload results?`
    );
    if (!ok) {
      return;
    }

    await applyChanges(modified);
  }
}

RewriteCommand.args = [{ name: 'script' }];
RewriteCommand.description = `Rewrite all the docs with a script`;

RewriteCommand.flags = {
  force: flags.boolean(),
  dry: flags.boolean(),
};

module.exports = RewriteCommand;
