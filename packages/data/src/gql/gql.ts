/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  query StoreBySlug($slug: String!) {\n    storesCollection(filter: { slug: { eq: $slug } }, first: 1) {\n      edges {\n        node {\n          id\n          slug\n          name\n          status\n          baseCurrency\n          whatsappPhone\n          logoUrl\n          theme\n        }\n      }\n    }\n  }\n": typeof types.StoreBySlugDocument,
    "\n  query StoreEntitlements($storeId: UUID!) {\n    storeEntitlements(pStoreId: $storeId, first: 100) {\n      edges {\n        node {\n          moduleCode\n          source\n          limits\n          endsAt\n        }\n      }\n    }\n    storeLimits(pStoreId: $storeId)\n  }\n": typeof types.StoreEntitlementsDocument,
    "\n  query Modules {\n    modulesCollection(orderBy: [{ sortOrder: AscNullsLast }], first: 100) {\n      edges {\n        node {\n          code\n          name\n          description\n          isCore\n        }\n      }\n    }\n  }\n": typeof types.ModulesDocument,
};
const documents: Documents = {
    "\n  query StoreBySlug($slug: String!) {\n    storesCollection(filter: { slug: { eq: $slug } }, first: 1) {\n      edges {\n        node {\n          id\n          slug\n          name\n          status\n          baseCurrency\n          whatsappPhone\n          logoUrl\n          theme\n        }\n      }\n    }\n  }\n": types.StoreBySlugDocument,
    "\n  query StoreEntitlements($storeId: UUID!) {\n    storeEntitlements(pStoreId: $storeId, first: 100) {\n      edges {\n        node {\n          moduleCode\n          source\n          limits\n          endsAt\n        }\n      }\n    }\n    storeLimits(pStoreId: $storeId)\n  }\n": types.StoreEntitlementsDocument,
    "\n  query Modules {\n    modulesCollection(orderBy: [{ sortOrder: AscNullsLast }], first: 100) {\n      edges {\n        node {\n          code\n          name\n          description\n          isCore\n        }\n      }\n    }\n  }\n": types.ModulesDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query StoreBySlug($slug: String!) {\n    storesCollection(filter: { slug: { eq: $slug } }, first: 1) {\n      edges {\n        node {\n          id\n          slug\n          name\n          status\n          baseCurrency\n          whatsappPhone\n          logoUrl\n          theme\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query StoreBySlug($slug: String!) {\n    storesCollection(filter: { slug: { eq: $slug } }, first: 1) {\n      edges {\n        node {\n          id\n          slug\n          name\n          status\n          baseCurrency\n          whatsappPhone\n          logoUrl\n          theme\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query StoreEntitlements($storeId: UUID!) {\n    storeEntitlements(pStoreId: $storeId, first: 100) {\n      edges {\n        node {\n          moduleCode\n          source\n          limits\n          endsAt\n        }\n      }\n    }\n    storeLimits(pStoreId: $storeId)\n  }\n"): (typeof documents)["\n  query StoreEntitlements($storeId: UUID!) {\n    storeEntitlements(pStoreId: $storeId, first: 100) {\n      edges {\n        node {\n          moduleCode\n          source\n          limits\n          endsAt\n        }\n      }\n    }\n    storeLimits(pStoreId: $storeId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Modules {\n    modulesCollection(orderBy: [{ sortOrder: AscNullsLast }], first: 100) {\n      edges {\n        node {\n          code\n          name\n          description\n          isCore\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query Modules {\n    modulesCollection(orderBy: [{ sortOrder: AscNullsLast }], first: 100) {\n      edges {\n        node {\n          code\n          name\n          description\n          isCore\n        }\n      }\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;