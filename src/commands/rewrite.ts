import { Command, flags } from '@oclif/command';
import { cli } from 'cli-ux';
import { cloneDeep } from 'lodash';
import { deepEqual } from 'fast-equals';
import { schemaSelector } from '../cli/schema';
import { applyChanges, getAllDocsHash } from '../cli/content';
import * as models from '../common/models';
import { setupRewriters, rewriters } from '../cli/rewriters';

const couchDbSchema = schemaSelector('couchTopicUpdate');

class RewriteCommand extends Command {
  async run() {
    const { args, flags: flagArgs } = this.parse(RewriteCommand);

    const rewriter = rewriters[args.script];
    if (rewriter === undefined) {
      throw new Error('no such rewriter');
    }

    const allDocs = await getAllDocsHash();
    const opts = await setupRewriters(allDocs);
    const modified: models.DocUpdate[] = [];

    for (let doc of Object.values(allDocs)) {
      const result = rewriter(cloneDeep(doc), opts);

      if (!result) continue;
      if (Array.isArray(result)) {
        if (result.length === 0) continue;
      } else if (result === doc || deepEqual(doc, result)) {
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
  force: flags.boolean({ char: 'f' }),
};

module.exports = RewriteCommand;
