/** Runtime shape of the checked-in Ajv standalone validator. No compiler ships to browsers. */
interface SchemaError {
  readonly instancePath: string;
  readonly keyword: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly message?: string;
}

interface LevelSchemaValidator {
  (json: unknown): boolean;
  errors?: readonly SchemaError[] | null;
}

declare const validate: LevelSchemaValidator;
export default validate;
