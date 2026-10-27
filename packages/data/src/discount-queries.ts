import { graphql } from "./gql";

// Admin reads of promotions and vouchers (staff of the store through RLS; codes never reach anon or customers).

export const AdminPromotionsQuery = graphql(`
  query AdminPromotions($storeId: UUID!) {
    promotionsCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ startsAt: DescNullsLast }]
      first: 200
    ) {
      edges {
        node {
          id
          name
          description
          reward
          value
          startsAt
          endsAt
          isActive
          priority
          promotionTargetsCollection(first: 200) {
            edges {
              node {
                targetType
                targetId
              }
            }
          }
        }
      }
    }
  }
`);

export const AdminVouchersQuery = graphql(`
  query AdminVouchers($storeId: UUID!) {
    vouchersCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ createdAt: DescNullsLast }]
      first: 200
    ) {
      edges {
        node {
          id
          code
          name
          scope
          reward
          value
          minSubtotal
          minQuantity
          usageLimit
          usagePerCustomer
          usedCount
          startsAt
          endsAt
          isActive
          voucherTargetsCollection(first: 200) {
            edges {
              node {
                targetType
                targetId
              }
            }
          }
          voucherUsagesCollection(orderBy: [{ createdAt: DescNullsLast }], first: 20) {
            edges {
              node {
                id
                amount
                currency
                phone
                createdAt
                releasedAt
                orders {
                  id
                  number
                  customerName
                }
              }
            }
          }
        }
      }
    }
  }
`);

/** Names for the target pickers: every category, collection and brand, and the products already chosen. */
export const DiscountTargetsQuery = graphql(`
  query DiscountTargets($storeId: UUID!, $productIds: [UUID!]!) {
    categoriesCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ path: AscNullsLast }]
      first: 500
    ) {
      edges {
        node {
          id
          name
          depth
        }
      }
    }
    collectionsCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ name: AscNullsLast }]
      first: 200
    ) {
      edges {
        node {
          id
          name
        }
      }
    }
    brandsCollection(filter: { storeId: { eq: $storeId } }, orderBy: [{ name: AscNullsLast }], first: 500) {
      edges {
        node {
          id
          name
        }
      }
    }
    productsCollection(filter: { storeId: { eq: $storeId }, id: { in: $productIds } }, first: 200) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`);
