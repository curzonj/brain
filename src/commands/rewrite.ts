import { Command, flags } from '@oclif/command';
import { cli } from 'cli-ux';
import { cloneDeep } from 'lodash';
import { deepEqual } from 'fast-equals';
import { schemaSelector } from '../cli/schema';
import { applyChanges, generatePatches, getAllDocsHash } from '../cli/content';
import * as models from '../common/models';
import { rewriters } from '../cli/rewriters';

const couchDbSchema = schemaSelector('couchTopicUpdate');

class RewriteCommand extends Command {
  async run() {
    const { args, flags: flagArgs } = this.parse(RewriteCommand);

    const rewriter = rewriters[args.script];
    if (rewriter === undefined) {
      throw new Error('no such rewriter');
    }

    const allDocs = await getAllDocsHash();
    const modified: models.DocUpdate[] = [];

    for (let doc of Object.values(allDocs)) {
      const theClone = cloneDeep(doc);
      delete theClone.patches;

      const result = rewriter(theClone, allDocs);

      if (
        Array.isArray(result) ||
        (result && result !== doc && !deepEqual(doc, result))
      ) {
        if (!Array.isArray(result) && !result.patches) {
          generatePatches(doc, result);
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
