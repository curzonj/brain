import { Command } from '@oclif/command';
import { schemaSelector } from '../cli/schema';
import {
  topicToDocID,
  getAllDocsHash,
  findMissingReferences,
} from '../cli/content';

const couchDbSchema = schemaSelector('payload');

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
      } else if (doc._id !== topicToDocID(doc.metadata.id)) {
        console.dir({
          _id: doc._id,
          id: doc.metadata.id,
          expectedDocID: topicToDocID(doc.metadata.id),
        });
        counter = counter + 1;
      }
    }

    const missingRefs = findMissingReferences(
      Object.values(allDocs).map(d => d.topic),
      allDocs
    );
    if (missingRefs.length > 0) console.dir({ missingRefs });

    console.log(`${counter} documents failed the audit`);
  }
}

AuditCommand.description = `Find all docs that don't match the schema`;
module.exports = AuditCommand;
