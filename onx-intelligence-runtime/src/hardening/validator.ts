export class StateValidator {
  validate(data: any, schema: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data) errors.push('Data is null');
    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required) {
        if (data[field] === undefined) errors.push(`Missing required field: ${field}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
