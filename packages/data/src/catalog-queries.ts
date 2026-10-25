import { graphql } from "./gql";

// Admin reads of the catalog (pg_graphql as the signed-in staff; RLS limits them to the store).
// max_rows is 100 per collection: listings paginate, structure lists are small by nature.

export const CatalogStructureQuery = graphql(`
  query CatalogStructure($storeId: UUID!) {
    attributesCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ sortOrder: AscNullsLast }]
      first: 100
    ) {
      edges {
        node {
          id
          name
          slug
          inputType
          unit
          valueRequired
          visibleInStorefront
          filterableInStorefront
          attributeValuesCollection(orderBy: [{ sortOrder: AscNullsLast }], first: 100) {
            edges {
              node {
                id
                name
                slug
                value
              }
            }
          }
        }
      }
    }
    productTypesCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ name: AscNullsLast }]
      first: 100
    ) {
      edges {
        node {
          id
          name
          slug
          hasVariants
          isShippingRequired
          productTypeAttributesCollection(orderBy: [{ sortOrder: AscNullsLast }], first: 50) {
            edges {
              node {
                attributeId
                scope
                variantSelection
              }
            }
          }
        }
      }
    }
    categoriesCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ depth: AscNullsLast }, { sortOrder: AscNullsLast }, { name: AscNullsLast }]
      first: 100
    ) {
      edges {
        node {
          id
          name
          slug
          parentId
          depth
          description
        }
      }
    }
    brandsCollection(filter: { storeId: { eq: $storeId } }, orderBy: [{ name: AscNullsLast }], first: 100) {
      edges {
        node {
          id
          name
          slug
          description
          isPublished
        }
      }
    }
    collectionsCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ sortOrder: AscNullsLast }]
      first: 100
    ) {
      edges {
        node {
          id
          name
          slug
          description
          isPublished
          rules
        }
      }
    }
    warehousesCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ createdAt: AscNullsLast }]
      first: 100
    ) {
      edges {
        node {
          id
          name
          address
          phone
          isDefault
          isPickupPoint
          isActive
        }
      }
    }
    storeCurrenciesCollection(filter: { storeId: { eq: $storeId } }, first: 10) {
      edges {
        node {
          currency
          isBase
          sells
          rateToBase
          rounding
        }
      }
    }
  }
`);

export const AdminProductsQuery = graphql(`
  query AdminProducts(
    $storeId: UUID!
    $query: String
    $status: String
    $categoryId: UUID
    $lowStock: Boolean
    $first: Int!
    $after: Cursor
  ) {
    adminSearchProducts(
      pStoreId: $storeId
      pQuery: $query
      pStatus: $status
      pCategoryId: $categoryId
      pLowStock: $lowStock
      first: $first
      after: $after
    ) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          slug
          status
          minPrice
          maxPrice
          inStock
          primaryMediaUrl
          updatedAt
          categoryId
          productVariantsCollection(first: 100) {
            edges {
              node {
                id
                sku
                stockAvailable
                trackInventory
              }
            }
          }
        }
      }
    }
  }
`);

export const ProductDetailQuery = graphql(`
  query ProductDetail($id: UUID!) {
    productsCollection(filter: { id: { eq: $id } }, first: 1) {
      edges {
        node {
          id
          productTypeId
          categoryId
          brandId
          name
          slug
          descriptionPlain
          status
          featured
          badge
          seoTitle
          seoDescription
          productTagsCollection(first: 30) {
            edges {
              node {
                tag
              }
            }
          }
          collectionProductsCollection(first: 50) {
            edges {
              node {
                collectionId
              }
            }
          }
          productAttributeValuesCollection(first: 100) {
            edges {
              node {
                attributeId
                valueId
                valueText
                valueNumeric
                valueBoolean
                valueDate
              }
            }
          }
          productMediaCollection(orderBy: [{ sortOrder: AscNullsLast }], first: 50) {
            edges {
              node {
                id
                url
                thumbUrl
                alt
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
                weight
                stockAvailable
                variantCosts {
                  costPrice
                  costCurrency
                }
                variantAttributeValuesCollection(first: 20) {
                  edges {
                    node {
                      attributeId
                      valueId
                    }
                  }
                }
                variantPricesCollection(first: 5) {
                  edges {
                    node {
                      currency
                      price
                      compareAtPrice
                    }
                  }
                }
                variantMediaCollection(first: 20) {
                  edges {
                    node {
                      mediaId
                    }
                  }
                }
                stocksCollection(first: 20) {
                  edges {
                    node {
                      warehouseId
                      quantity
                      quantityAllocated
                    }
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
