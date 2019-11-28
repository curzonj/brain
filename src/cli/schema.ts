import * as fs from 'fs';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';

const schemaContents = fs.readFileSync(`${__dirname}/../../schema.yml`, 'utf8');

type SchemaName = 'payload' | 'editor';
export function schemaSelector(definition: SchemaName): Ajv.ValidateFunction {
  const schemaDocument = yaml.safeLoad(schemaContents);
  schemaDocument.$ref = `#/definitions/${definition}`;

  const ajv = new Ajv(); // options can be passed, e.g. {allErrors: true}
  return ajv.compile(schemaDocument);
}
