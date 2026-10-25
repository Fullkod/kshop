import { graphql } from "./gql";

// Admin reads of orders, customers and checkout settings (pg_graphql as the signed-in staff; RLS limits them
// to the store, and line costs to admins). Writes go through /api/v1.

export const AdminOrdersQuery = graphql(`
  query AdminOrders($filter: OrdersFilter!, $first: Int!, $after: Cursor) {
    ordersCollection(filter: $filter, orderBy: [{ createdAt: DescNullsLast }], first: $first, after: $after) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          number
          status
          paymentStatus
          channel
          currency
          total
          subtotal
          shippingTotal
          paidTotal
          customerName
          customerPhone
          shippingType
          createdAt
          orderLinesCollection(first: 100) {
            edges {
              node {
                quantity
              }
            }
          }
        }
      }
    }
  }
`);

export const AdminOrderQuery = graphql(`
  query AdminOrder($id: UUID!) {
    ordersCollection(filter: { id: { eq: $id } }, first: 1) {
      edges {
        node {
          id
          storeId
          number
          publicToken
          status
          paymentStatus
          channel
          currency
          exchangeRate
          subtotal
          shippingTotal
          discountTotal
          total
          paidTotal
          customerId
          customerName
          customerPhone
          customerNote
          shippingType
          shippingSnapshot
          paymentMethodId
          paymentSnapshot
          createdAt
          confirmedAt
          paidAt
          shippedAt
          deliveredAt
          cancelledAt
          cancelReason
          customers {
            id
            firstName
            lastName
            phone
          }
          orderDiscountsCollection(first: 20) {
            edges {
              node {
                id
                kind
                name
                code
                reward
                value
                amount
                reason
              }
            }
          }
          orderLinesCollection(orderBy: [{ sortOrder: AscNullsLast }], first: 100) {
            edges {
              node {
                id
                productId
                productName
                variantName
                sku
                attributes
                imageUrl
                quantity
                unitListPrice
                unitPrice
                compareAtPrice
                lineTotal
                promotionName
                orderLineCosts {
                  unitCost
                  costCurrency
                }
              }
            }
          }
          orderEventsCollection(orderBy: [{ createdAt: AscNullsLast }], first: 100) {
            edges {
              node {
                id
                type
                isInternal
                payload
                createdAt
              }
            }
          }
          paymentsCollection(orderBy: [{ createdAt: AscNullsLast }], first: 100) {
            edges {
              node {
                id
                amount
                currency
                reference
                evidencePath
                paymentMethodId
                createdAt
              }
            }
          }
          refundsCollection(orderBy: [{ createdAt: AscNullsLast }], first: 100) {
            edges {
              node {
                id
                amount
                currency
                reason
                createdAt
              }
            }
          }
        }
      }
    }
  }
`);

export const AdminCustomersQuery = graphql(`
  query AdminCustomers($filter: CustomersFilter!, $first: Int!, $after: Cursor) {
    customersCollection(filter: $filter, orderBy: [{ createdAt: DescNullsLast }], first: $first, after: $after) {
      totalCount
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          firstName
          lastName
          phone
          email
          isBlocked
          acceptsMarketing
          lastOrderAt
          createdAt
          ordersCollection(first: 100) {
            totalCount
          }
        }
      }
    }
  }
`);

export const CheckoutSettingsQuery = graphql(`
  query CheckoutSettings($storeId: UUID!) {
    storesCollection(filter: { id: { eq: $storeId } }, first: 1) {
      edges {
        node {
          orderPrefix
          whatsappPhone
          baseCurrency
        }
      }
    }
    shippingZonesCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ sortOrder: AscNullsLast }, { name: AscNullsLast }]
      first: 100
    ) {
      edges {
        node {
          id
          name
          description
          isActive
          sortOrder
        }
      }
    }
    shippingMethodsCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ sortOrder: AscNullsLast }, { name: AscNullsLast }]
      first: 100
    ) {
      edges {
        node {
          id
          zoneId
          type
          name
          price
          freeOverSubtotal
          warehouseId
          minDays
          maxDays
          isActive
          sortOrder
        }
      }
    }
    paymentMethodsCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ sortOrder: AscNullsLast }, { name: AscNullsLast }]
      first: 100
    ) {
      edges {
        node {
          id
          name
          currencies
          instructions
          isActive
          sortOrder
        }
      }
    }
    warehousesCollection(filter: { storeId: { eq: $storeId } }, first: 100) {
      edges {
        node {
          id
          name
          address
          isPickupPoint
          isActive
        }
      }
    }
  }
`);

// "Nuevo pedido": products of the store (any status but archived) with their variants and base prices.
export const OrderVariantSearchQuery = graphql(`
  query OrderVariantSearch($storeId: UUID!, $query: String) {
    adminSearchProducts(pStoreId: $storeId, pQuery: $query, first: 10) {
      edges {
        node {
          id
          name
          status
          primaryMediaUrl
          productVariantsCollection(orderBy: [{ sortOrder: AscNullsLast }], first: 100) {
            edges {
              node {
                id
                sku
                name
                price
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
