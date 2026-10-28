import { validateOntologyDraftSemantics } from "./ontology-semantic-validation.ts";

export type OntologyRuntimeRecord = Record<string, unknown>;
export type OntologySchemaValidator = (value: unknown) => boolean;

export const MAX_ONTOLOGY_RECORDS = 8;
export const MAX_ONTOLOGY_CONTEXT_BYTES = 48 * 1024;

export function validateRuntimeOntologyRecords(
  body: Record<string, unknown>,
  validateSchema: OntologySchemaValidator,
): { records: OntologyRuntimeRecord[]; error?: string } {
  const supplied = body.ontology_records ??
    (body.ontology_record === undefined ? [] : [body.ontology_record]);
  if (!Array.isArray(supplied)) {
    return { records: [], error: "ontology_records must be an array" };
  }
  if (supplied.length > MAX_ONTOLOGY_RECORDS) {
    return {
      records: [],
      error: `ontology_records exceeds the limit of ${MAX_ONTOLOGY_RECORDS}`,
    };
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(supplied);
  } catch {
    return { records: [], error: "ontology_records is not serializable JSON" };
  }
  if (
    new TextEncoder().encode(serialized).byteLength >
      MAX_ONTOLOGY_CONTEXT_BYTES
  ) {
    return {
      records: [],
      error: "ontology_records exceeds the context size limit",
    };
  }

  const records: OntologyRuntimeRecord[] = [];
  for (let i = 0; i < supplied.length; i++) {
    const record = supplied[i];
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return {
        records: [],
        error: `ontology_records[${i}] must be an object`,
      };
    }
    if (!validateSchema(record)) {
      return {
        records: [],
        error: `ontology_records[${i}] failed schema validation`,
      };
    }
    const semanticIssues = validateOntologyDraftSemantics(record);
    if (semanticIssues.length) {
      return {
        records: [],
        error: `ontology_records[${i}] failed semantic validation: ${
          semanticIssues[0].code
        }`,
      };
    }
    records.push(record as OntologyRuntimeRecord);
  }
  return { records };
}
