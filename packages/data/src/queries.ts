import { graphql } from "./gql";

// Public store card (anon). Server code caches it per store.
export const StoreBySlugQuery = graphql(`
  query StoreBySlug($slug: String!) {
    storesCollection(filter: { slug: { eq: $slug } }, first: 1) {
      edges {
        node {
          id
          slug
          name
          status
          baseCurrency
          whatsappPhone
          logoUrl
          theme
        }
      }
    }
  }
`);

// Active modules of a store for its staff (RLS: members and superadmin only).
export const StoreEntitlementsQuery = graphql(`
  query StoreEntitlements($storeId: UUID!) {
    storeEntitlements(pStoreId: $storeId, first: 100) {
      edges {
        node {
          moduleCode
          source
          limits
          endsAt
        }
      }
    }
    storeLimits(pStoreId: $storeId)
  }
`);

// Module catalog (public), used to show modules that are not in the store's plan.
export const ModulesQuery = graphql(`
  query Modules {
    modulesCollection(orderBy: [{ sortOrder: AscNullsLast }], first: 100) {
      edges {
        node {
          code
          name
          description
          isCore
        }
      }
    }
  }
`);
