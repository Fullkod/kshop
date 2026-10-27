import { graphql } from "./gql";

// Admin reads of the storefront content (pg_graphql as the signed-in staff: RLS shows hidden and scheduled rows).

export const AdminContentQuery = graphql(`
  query AdminContent($storeId: UUID!) {
    storesCollection(filter: { id: { eq: $storeId } }, first: 1) {
      edges {
        node {
          theme
          description
        }
      }
    }
    bannersCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ sortOrder: AscNullsLast }]
      first: 100
    ) {
      edges {
        node {
          id
          title
          subtitle
          ctaLabel
          imageUrl
          imageMobileUrl
          alt
          linkType
          linkTargetId
          linkUrl
          isVisible
          startsAt
          endsAt
        }
      }
    }
    homeSectionsCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ sortOrder: AscNullsLast }]
      first: 100
    ) {
      edges {
        node {
          id
          type
          title
          sourceCollectionId
          sourceCategoryId
          sourceBrandId
          settings
          isVisible
          startsAt
          endsAt
          homeSectionBannersCollection(orderBy: [{ sortOrder: AscNullsLast }], first: 8) {
            edges {
              node {
                bannerId
              }
            }
          }
        }
      }
    }
    menusCollection(filter: { storeId: { eq: $storeId } }, first: 2) {
      edges {
        node {
          location
          menuItemsCollection(orderBy: [{ sortOrder: AscNullsLast }], first: 100) {
            edges {
              node {
                id
                parentId
                label
                linkType
                linkTargetId
                linkUrl
              }
            }
          }
        }
      }
    }
    pagesCollection(filter: { storeId: { eq: $storeId } }, orderBy: [{ title: AscNullsLast }], first: 100) {
      edges {
        node {
          id
          title
          slug
          content
          isPublished
          seoTitle
          seoDescription
        }
      }
    }
    productsCollection(
      filter: { storeId: { eq: $storeId }, status: { eq: published } }
      orderBy: [{ name: AscNullsLast }]
      first: 100
    ) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`);
