import type { CodegenConfig } from "@graphql-codegen/cli";

// Schema comes from `pnpm db:graphql-schema` (pg_graphql introspection as `authenticated`).
const config: CodegenConfig = {
  schema: "graphql/schema.json",
  documents: ["src/**/*.ts", "!src/gql/**"],
  ignoreNoDocuments: true,
  generates: {
    "src/gql/": {
      preset: "client",
      presetConfig: { fragmentMasking: false },
      config: {
        useTypeImports: true,
        enumsAsTypes: true,
        scalars: {
          UUID: "string",
          Datetime: "string",
          Date: "string",
          Time: "string",
          JSON: "string",
          BigInt: "string",
          BigFloat: "string",
          Cursor: "string",
          Opaque: "unknown",
        },
      },
    },
  },
};

export default config;
