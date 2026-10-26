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

// Slug of a store by id (the store app sends the id).
export const StoreSlugByIdQuery = graphql(`
  query StoreSlugById($id: UUID!) {
    storesCollection(filter: { id: { eq: $id } }, first: 1) {
      edges {
        node {
          slug
        }
      }
    }
  }
`);

// Store slugs visible to anon (prerendered store routes).
export const StoreSlugsQuery = graphql(`
  query StoreSlugs {
    storesCollection(filter: { status: { eq: active } }, first: 100) {
      edges {
        node {
          slug
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
    subscriptionsCollection(filter: { storeId: { eq: $storeId } }, first: 1) {
      edges {
        node {
          status
          trialEndsAt
        }
      }
    }
    storesCollection(filter: { id: { eq: $storeId } }, first: 1) {
      edges {
        node {
          status
        }
      }
    }
    modulesCollection(first: 100) {
      edges {
        node {
          code
          addonPrice
        }
      }
    }
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
