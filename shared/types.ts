// Schema-derived types (CreateItemInput, UpdateItemInput, Item) live in ./schemas.ts.
// This file holds types with no Zod schema counterpart.

export type ApiError = {
  error: string;
  details?: Array<{ field: string; message: string }>;
};
