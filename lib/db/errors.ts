export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof AggregateError) {
    return {
      name: error.name,
      message: error.message,
      errors: error.errors.map((entry: unknown) => serializeError(entry)),
    };
  }

  if (error instanceof Error) {
    const withConnectionDetails = error as Error & {
      code?: string;
      errno?: string;
      address?: string;
      port?: number;
    };

    return {
      name: error.name,
      message: error.message,
      code: withConnectionDetails.code,
      errno: withConnectionDetails.errno,
      address: withConnectionDetails.address,
      port: withConnectionDetails.port,
    };
  }

  return {
    message: "Unknown error",
    value: String(error),
  };
}
