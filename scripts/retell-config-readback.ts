export function assertExpectedConfig(
  expected: unknown,
  actual: unknown,
  path: string,
): void {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      throwMismatch(path);
    }

    expected.forEach((value, index) => {
      assertExpectedConfig(value, actual[index], `${path}[${index}]`);
    });
    return;
  }

  if (isRecord(expected)) {
    if (!isRecord(actual)) {
      throwMismatch(path);
    }

    for (const [key, value] of Object.entries(expected)) {
      if (value === undefined) {
        continue;
      }
      assertExpectedConfig(value, actual[key], `${path}.${key}`);
    }
    return;
  }

  if (expected !== actual) {
    throwMismatch(path);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function throwMismatch(path: string): never {
  throw new Error(`${path} does not match the immutable repository build definition.`);
}
