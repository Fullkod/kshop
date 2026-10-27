import { graphql } from "./gql";

// Admin reads of the WhatsApp notices of a store (staff through RLS).

export const NotificationSettingsQuery = graphql(`
  query NotificationSettings($storeId: UUID!) {
    storeNotificationContactsCollection(
      filter: { storeId: { eq: $storeId } }
      orderBy: [{ sortOrder: AscNullsLast }, { name: AscNullsLast }]
      first: 50
    ) {
      edges {
        node {
          id
          name
          phone
          notifyNewOrder
          notifyPaymentRecorded
          showToCustomer
          isActive
        }
      }
    }
    whatsappTemplatesCollection(first: 100) {
      edges {
        node {
          id
          storeId
          event
          audience
          body
          isActive
        }
      }
    }
  }
`);

export const NotificationLogQuery = graphql(`
  query NotificationLog($filter: NotificationLogFilter, $first: Int!, $after: Cursor) {
    notificationLogCollection(
      filter: $filter
      orderBy: [{ createdAt: DescNullsLast }]
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
          orderId
          audience
          event
          recipient
          message
          status
          attempts
          error
          sentAt
          createdAt
          orders {
            number
          }
        }
      }
    }
  }
`);
