import * as fs from 'fs';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import $RefParser from 'json-schema-ref-parser';

const schemaContents = fs.readFileSync(`${__dirname}/../../schema.yml`, 'utf8');

type SchemaName = 'payload' | 'editor';
export function schemaSelector(definition: SchemaName): Ajv.ValidateFunction {
  const schemaDocument = yaml.safeLoad(schemaContents);
  schemaDocument.$ref = `#/definitions/${definition}`;

  const ajv = new Ajv(); // options can be passed, e.g. {allErrors: true}
  return ajv.compile(schemaDocument);
}

export type DecodedSchema = $RefParser.JSONSchema;
async function dereferenceSchema() {
  const schemaDocument = yaml.safeLoad(schemaContents);
  return $RefParser.dereference(schemaDocument);
}

const schemaPromise = dereferenceSchema();
export async function getSchemaContents(): Promise<DecodedSchema> {
  return schemaPromise;
}

export function getFieldType(
  schema: DecodedSchema,
  typeName: string,
  fieldName: string
): string | undefined | DecodedSchema {
  if (!schema.definitions) {
    return;
  }

  const typeDef = schema.definitions[typeName];
  if (!typeDef || typeDef === true) {
    return;
  }

  const propDef = typeDef.properties && typeDef.properties[fieldName];
  if (!propDef || propDef === true) {
    return;
  }

  if (typeof propDef.type === 'string') {
    return propDef.type;
  }

  return propDef;
}
