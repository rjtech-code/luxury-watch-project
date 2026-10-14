import { badRequest } from '../lib/errors.js';

/** validate({ body, query, params }) with Zod schemas. Parsed values replace the raw ones. */
export const validate = (schemas) => (req, _res, next) => {
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(badRequest(details[0]?.message ?? 'Invalid input', details));
    }
    // Replace the raw value so handlers only ever see validated, coerced data.
    Object.defineProperty(req, part, { value: result.data, writable: true, configurable: true, enumerable: true });
  }
  next();
};
