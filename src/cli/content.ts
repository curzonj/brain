import * as crypto from "crypto";
import * as fs from "fs";
import { getDB } from "./db";
import { ComplexError } from "./errors";
import * as models from "./models";
import { dumpDatabaseToRDF, mirrorChangesToRDF } from "./rdf_dump";
import { schemaSelector } from "./schema";

const couchDbSchema = schemaSelector("couchTopicUpdate");

export async function applyChanges(
  updates: models.DocUpdate[],
  docsToDelete: models.ExistingDoc[],
) {
  const deletes = docsToDelete.map((d) => ({ ...d, _deleted: true } as models.DocUpdate));
  const changes = [ ...updates, ...deletes ];

  validateUpdates(changes);

  const db = await getDB();

  await db.bulkDocs(changes);
  await mirrorChangesToRDF(changes);
  await dumpJSON();
  await dumpDatabaseToRDF();
}

function validateUpdates(updates: models.DocUpdate[]) {
  updates.forEach((u) => {
    if (!couchDbSchema(u)) {
      throw new ComplexError("update didn't match the schema", {
        update: u,
        errors: couchDbSchema.errors,
      });
    }
  });
}

export async function dumpJSON() {
  const db = await getDB();

  const { rows } = await db.allDocs({
    include_docs: true,
  });

  const docs = rows.map((r) => r.doc);

  fs.writeFileSync(
    `${__dirname}/../../exports/couchdb_dump.json`,
    JSON.stringify(docs, null, " "),
  );
}

export function topicToDocID(topicID: string): string {
  function hash(s: string): string {
    const h = crypto.createHash("md5");
    h.update(s);
    return h.digest("hex");
  }

  if (!topicID.startsWith("/")) {
    throw new ComplexError("invalid topicID", {
      topicID,
    });
  }

  return `$/topics/${hash(topicID)}`;
}
