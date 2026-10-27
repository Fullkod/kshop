import { graphql } from "./gql";

// Public storefront reads (anon, pg_graphql). RLS keeps them to published content of active stores; they never
// ask for costs, stocks or drafts. The web caches them per store; the store app (Phase 7) reuses them.

/** Header/footer: menus, top-level categories (fallback navigation), sale currencies and published pages. */
export const StorefrontShellQuery = graphql(`
  query StorefrontShell($storeId: UUID!) {
    storefrontFeatures(pStoreId: $storeId)
    shippingMethodsCollection(
      filter: { storeId: { eq: $storeId }, isActive: { eq: true } }
      orderBy: [{ sortOrder: AscNullsLast }]
      first: 50
    ) {
      edges {
        node {
          name
          type
          price
          minDays
          maxDays
          freeOverSubtotal
        }
      }
    }
    paymentMethodsCollection(
      filter: { storeId: { eq: $storeId }, isActive: { eq: true } }
      orderBy: [{ sortOrder: AscNullsLast }]
      first: 20
    ) {
      edges {
        node {
          name
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
    categoriesCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ sortOrder: AscNullsLast }, { name: AscNullsLast }]
      first: 100
    ) {
      edges {
        node {
          id
          parentId
          name
          slug
          imageUrl
          depth
        }
      }
    }
    collectionsCollection(filter: { storeId: { eq: $storeId } }, first: 100) {
      edges {
        node {
          id
          name
          slug
          imageUrl
        }
      }
    }
    announcement: homeSectionsCollection(
      filter: { storeId: { eq: $storeId }, type: { eq: announcement_bar } }
      orderBy: [{ sortOrder: AscNullsLast }]
      first: 1
    ) {
      edges {
        node {
          settings
        }
      }
    }
    brandsCollection(filter: { storeId: { eq: $storeId } }, orderBy: [{ name: AscNullsLast }], first: 100) {
      edges {
        node {
          id
          name
          slug
          logoUrl
        }
      }
    }
    pagesCollection(filter: { storeId: { eq: $storeId } }, first: 50) {
      edges {
        node {
          id
          slug
          title
        }
      }
    }
    storeCurrenciesCollection(filter: { storeId: { eq: $storeId } }, first: 5) {
      edges {
        node {
          currency
          isBase
          rateToBase
          rounding
        }
      }
    }
  }
`);

/** Home: visible sections in order with their banners (RLS already applies visibility and dates). */
export const StorefrontHomeQuery = graphql(`
  query StorefrontHome($storeId: UUID!) {
    homeSectionsCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ sortOrder: AscNullsLast }]
      first: 30
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
          endsAt
          homeSectionBannersCollection(orderBy: [{ sortOrder: AscNullsLast }], first: 8) {
            edges {
              node {
                banners {
                  id
                  eyebrow
                  title
                  subtitle
                  ctaLabel
                  productId
                  imageUrl
                  imageMobileUrl
                  alt
                  linkType
                  linkTargetId
                  linkUrl
                }
              }
            }
          }
        }
      }
    }
  }
`);

/** Number of published products of the categories and collections shown (home category grid and collection cards);
 *  ids as comma-separated text (R9: only the tiles shown are counted). */
export const StorefrontProductCountsQuery = graphql(`
  query StorefrontProductCounts($storeId: UUID!, $categoryIds: String, $collectionIds: String) {
    storefrontProductCounts(pStoreId: $storeId, pCategoryIds: $categoryIds, pCollectionIds: $collectionIds)
  }
`);

/** Home carousel («todo», category, brand, on sale): a filter pg_graphql turns into an indexed read with the limit,
 *  instead of the search function computing every id of the catalog twice (R9). */
export const StorefrontCarouselQuery = graphql(`
  query StorefrontCarousel($filter: ProductsFilter!, $orderBy: [ProductsOrderBy!], $first: Int!) {
    productsCollection(filter: $filter, orderBy: $orderBy, first: $first) {
      edges {
        node {
          ...StorefrontProductCard
        }
      }
    }
  }
`);

/** Home carousel of a collection (manual or by rules): the search function, without the totalCount that runs it again. */
export const StorefrontCollectionCarouselQuery = graphql(`
  query StorefrontCollectionCarousel(
    $storeId: UUID!
    $collectionId: UUID!
    $orderBy: [ProductsOrderBy!]
    $first: Int!
  ) {
    storefrontSearchProducts(
      pStoreId: $storeId
      pCollectionId: $collectionId
      orderBy: $orderBy
      first: $first
    ) {
      edges {
        node {
          ...StorefrontProductCard
        }
      }
    }
  }
`);

/** Fields of a product card (listings, carousels, favorites). */
export const StorefrontProductCardFragment = graphql(`
  fragment StorefrontProductCard on Products {
    id
    slug
    name
    minPrice
    maxPrice
    inStock
    badge
    primaryMediaUrl
    brands {
      name
    }
    productVariantsCollection(first: 20) {
      edges {
        node {
          id
          trackInventory
          stockAvailable
          price
          compareAtPrice
          variantAttributeValuesCollection(first: 5) {
            edges {
              node {
                attributeValues {
                  value
                }
              }
            }
          }
          variantPromotions {
            promoPrice
            reward
            value
            promotionName
          }
          variantPricesCollection(first: 3) {
            edges {
              node {
                currency
                price
              }
            }
          }
        }
      }
    }
  }
`);

export const StorefrontProductsQuery = graphql(`
  query StorefrontProducts(
    $storeId: UUID!
    $query: String
    $categoryId: UUID
    $collectionId: UUID
    $brandIds: String
    $valueIds: String
    $minPrice: BigFloat
    $maxPrice: BigFloat
    $inStock: Boolean
    $onSale: Boolean
    $orderBy: [ProductsOrderBy!]
    $first: Int!
    $offset: Int
  ) {
    storefrontSearchProducts(
      pStoreId: $storeId
      pQuery: $query
      pCategoryId: $categoryId
      pCollectionId: $collectionId
      pBrandIds: $brandIds
      pValueIds: $valueIds
      pMinPrice: $minPrice
      pMaxPrice: $maxPrice
      pInStock: $inStock
      pOnSale: $onSale
      orderBy: $orderBy
      first: $first
      offset: $offset
    ) {
      totalCount
      edges {
        node {
          ...StorefrontProductCard
        }
      }
    }
  }
`);

/** Published product cards by id (favorites), at most 100. */
export const StorefrontProductCardsQuery = graphql(`
  query StorefrontProductCards($storeId: UUID!, $ids: [UUID!]!) {
    productsCollection(filter: { storeId: { eq: $storeId }, id: { in: $ids } }, first: 100) {
      edges {
        node {
          ...StorefrontProductCard
        }
      }
    }
  }
`);

/** Filter panel of a listing (JSON built by storefront_product_facets). */
export const StorefrontFacetsQuery = graphql(`
  query StorefrontFacets(
    $storeId: UUID!
    $query: String
    $categoryId: UUID
    $collectionId: UUID
    $brandIds: String
    $valueIds: String
    $minPrice: BigFloat
    $maxPrice: BigFloat
    $inStock: Boolean
    $onSale: Boolean
  ) {
    storefrontProductFacets(
      pStoreId: $storeId
      pQuery: $query
      pCategoryId: $categoryId
      pCollectionId: $collectionId
      pBrandIds: $brandIds
      pValueIds: $valueIds
      pMinPrice: $minPrice
      pMaxPrice: $maxPrice
      pInStock: $inStock
      pOnSale: $onSale
    )
  }
`);

/** Product page. */
/** Everything the product page shows (also the featured product of the home, read by id). */
export const StorefrontProductFullFragment = graphql(`
  fragment StorefrontProductFull on Products {
          id
          slug
          name
          description
          descriptionPlain
          seoTitle
          seoDescription
          minPrice
          maxPrice
          inStock
          primaryMediaUrl
          categoryId
          brands {
            name
            slug
          }
          categories {
            id
            name
            slug
            parentId
          }
          productMediaCollection(orderBy: [{ sortOrder: AscNullsLast }], first: 30) {
            edges {
              node {
                id
                url
                thumbUrl
                alt
              }
            }
          }
          productAttributeValuesCollection(first: 50) {
            edges {
              node {
                valueText
                valueNumeric
                valueBoolean
                valueDate
                attributes {
                  name
                  unit
                  visibleInStorefront
                  sortOrder
                }
                attributeValues {
                  name
                }
              }
            }
          }
          productVariantsCollection(orderBy: [{ sortOrder: AscNullsLast }], first: 100) {
            edges {
              node {
                id
                sku
                name
                price
                compareAtPrice
                trackInventory
                stockAvailable
                variantPromotions {
                  promoPrice
                  reward
                  value
                  promotionName
                }
                variantPricesCollection(first: 3) {
                  edges {
                    node {
                      currency
                      price
                      compareAtPrice
                    }
                  }
                }
                variantMediaCollection(first: 10) {
                  edges {
                    node {
                      mediaId
                    }
                  }
                }
                variantAttributeValuesCollection(first: 10) {
                  edges {
                    node {
                      attributeId
                      valueId
                      attributeValues {
                        name
                        slug
                        value
                        sortOrder
                        attributes {
                          name
                          slug
                          sortOrder
                        }
                      }
                    }
                  }
                }
              }
            }
          }
  }
`);

export const StorefrontProductQuery = graphql(`
  query StorefrontProduct($storeId: UUID!, $slug: String!) {
    productsCollection(filter: { storeId: { eq: $storeId }, slug: { eq: $slug } }, first: 1) {
      edges {
        node {
          ...StorefrontProductFull
        }
      }
    }
  }
`);

export const StorefrontProductByIdQuery = graphql(`
  query StorefrontProductById($storeId: UUID!, $id: UUID!) {
    productsCollection(filter: { storeId: { eq: $storeId }, id: { eq: $id } }, first: 1) {
      edges {
        node {
          ...StorefrontProductFull
        }
      }
    }
  }
`);

/** Static page. */
export const StorefrontPageQuery = graphql(`
  query StorefrontPage($storeId: UUID!, $slug: String!) {
    pagesCollection(filter: { storeId: { eq: $storeId }, slug: { eq: $slug } }, first: 1) {
      edges {
        node {
          id
          title
          content
          seoTitle
          seoDescription
          updatedAt
        }
      }
    }
  }
`);

/** Published product slugs for the sitemap (paginated by cursor, 100 per page). */
export const StorefrontSitemapQuery = graphql(`
  query StorefrontSitemap($storeId: UUID!, $after: Cursor) {
    productsCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ id: AscNullsLast }]
      first: 100
      after: $after
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          slug
          updatedAt
        }
      }
    }
  }
`);

/** Slugs of published products by id (typed links to products). */
export const ProductSlugsQuery = graphql(`
  query ProductSlugs($storeId: UUID!, $ids: [UUID!]!) {
    productsCollection(filter: { storeId: { eq: $storeId }, id: { in: $ids } }, first: 100) {
      edges {
        node {
          id
          slug
        }
      }
    }
  }
`);
