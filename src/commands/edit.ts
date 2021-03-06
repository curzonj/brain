import { Command, flags } from '@oclif/command';
import { cli } from 'cli-ux';

import {
  applyEditorChanges,
  buildEditorStructure,
  editFile,
  sortedYamlDump,
  EditorTopic,
} from '../cli/editor';
import * as models from '../common/models';
import { schemaSelector } from '../cli/schema';
import { readExport } from '../cli/paths';

const editorSchema = schemaSelector('editor');

class EditCommand extends Command {
  public async run() {
    const {
      flags: { recover },
    } = this.parse(EditCommand);

    const content = await buildEditorStructure();
    const contentString = await getContentString(content, recover);
    if (!contentString) {
      return;
    }

    const result = await editFile(contentString, onInvalidResult);
    if (!result) {
      this.log('Cancelled, skipping save');
      return;
    }

    if (!result.changed && !recover) {
      this.log('No changes, skipping save');
      return;
    }

    await applyEditorChanges(content, result.content);
  }
}

EditCommand.aliases = ['vim'];
EditCommand.description = `Edits the entire kbase in your $EDITOR`;

EditCommand.flags = {
  recover: flags.boolean({ char: 'r' }),
};

module.exports = EditCommand;

async function getContentString(
  content: models.Map<EditorTopic>,
  recover: boolean
): Promise<string | undefined> {
  if (!editorSchema(content)) {
    console.log(JSON.stringify(editorSchema.errors, null, ' '));

    const ok = await cli.confirm(
      `The editor content is invalid, continue (yes/no)?`
    );
    if (!ok) {
      return;
    }
  }

  if (recover) {
    const ok = await cli.confirm(
      `Are you sure you want to recover the export? This is a destructive operation (yes/no)?`
    );
    if (!ok) {
      return;
    }

    return readExport('kb.yml');
  }

  return sortedYamlDump(content);
}

async function onInvalidResult(
  err: any,
  originalInput: string,
  editorContents: string
) {
  console.log('Invalid YAML:');
  if (Array.isArray(err) && err.length === 1 && err[0].missing) {
    console.dir(err[0].missing);
  } else {
    console.log(err);
  }

  const ok = await cli.confirm(`Do you want to continue editing (yes/no)?`);
  if (ok) {
    return editFile(editorContents, onInvalidResult, originalInput);
  }

  return undefined;
}
