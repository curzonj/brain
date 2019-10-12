import { Command } from '@oclif/command';
import { schemaSelector } from '../cli/schema';
import { getAllDocsHash, findMissingReferences } from '../cli/content';

const couchDbSchema = schemaSelector('existingDocument');

class AuditCommand extends Command {
  async run() {
    let counter = 0;
    const allDocs = await getAllDocsHash();
    for (let doc of Object.values(allDocs)) {
      if (!couchDbSchema(doc)) {
        console.dir({
          doc,
          errors: couchDbSchema.errors,
        });
        counter = counter + 1;
      }
    }

    const missingRefs = findMissingReferences(allDocs);
    if (missingRefs.length > 0) console.dir({ missingRefs });

    console.log(`${counter} documents failed the audit`);
  }
}

AuditCommand.description = `Find all docs that don't match the schema`;
module.exports = AuditCommand;
