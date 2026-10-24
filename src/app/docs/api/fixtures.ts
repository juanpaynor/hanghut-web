/**
 * Canned API responses, shared by the reference prose and the sandbox console.
 *
 * These were inline consts in api-docs-client.tsx. They moved here because the
 * sandbox answers from the same fixtures the docs display: if the two drifted,
 * the console would teach a response shape the page contradicts three lines
 * above it.
 *
 * Every fixture is a real response shape from src/app/api/v1 with the values
 * replaced. Keep them that way -- a reader copies these into their own types.
 */

export const subscriptionTiersRes = `{
  "data": {
    "tiers": [
      {
        "id": "3f2a1b9c-...",
        "name": "Backstage",
        "description": "Early access to tickets and monthly livestreams",
        "price_monthly": 250,
        "is_active": true,
        "perks": ["Early ticket access", "Monthly livestream"],
        "created_at": "2026-02-11T08:14:22Z"
      }
    ]
  }
}`

export const subscriptionsRes = `{
  "data": {
    "subscriptions": [
      {
        "id": "9c4e7d21-...",
        "status": "active",
        "tier": {
          "id": "3f2a1b9c-...",
          "name": "Backstage",
          "price_monthly": 250
        },
        "customer": {
          "id": "b7d1f004-...",
          "email": "juan@example.com",
          "name": "Juan Dela Cruz"
        },
        "currency": "PHP",
        "interval": "monthly",
        "current_period_start": "2026-08-01T00:00:00Z",
        "current_period_end": "2026-09-01T00:00:00Z",
        "cancelled_at": null,
        "created_at": "2026-06-01T09:12:00Z",
        "updated_at": "2026-08-01T00:00:04Z"
      }
    ],
    "meta": {
      "page": 1,
      "per_page": 20,
      "total": 1,
      "total_pages": 1,
      "has_more": false
    }
  }
}`

export const subscriptionWriteUnavailableRes = `{
  "error": "Subscription management via API is not yet available."
}`

export const listEventsRes = `{
  "data": {
    "events": [
      {
        "id": "bdb74865-8347-...",
        "title": "Tinda Tindahan",
        "status": "active",
        "start_datetime": "2026-04-14T11:07:00+00:00",
        "end_datetime": null,
        "venue_name": "98 Escolta St",
        "city": "Manila",
        "capacity": 100,
        "cover_image_url": "https://api.hanghut.com/storage/v1/...",
        "ticket_price": 700,
        "event_type": "art",
        "tickets_sold": 10,
        "ticket_tiers": [
          {
            "id": "a8af9742-...",
            "name": "General Admission",
            "price": 700,
            "quantity_total": 100,
            "quantity_sold": 0,
            "is_active": true,
            "sort_order": 0
          }
        ]
      }
    ],
    "meta": {
      "page": 1,
      "per_page": 20,
      "total": 2,
      "total_pages": 1,
      "has_more": false
    }
  }
}`

export const sectionsRes = `{
  "data": {
    "seated": true,
    "selection_mode": "both",
    "sections": [
      {
        "id": "0887cc4a-...",
        "label": "Orchestra Left",
        "available": 42,
        "largest_block": 6,
        "on_sale": true,
        "prices": [
          {
            "tier_id": "7c33ac2d-...",
            "name": "Orchestra",
            "price": 1500,
            "available": 42,
            "largest_block": 6
          }
        ]
      }
    ]
  }
}`

export const sectionsUnseatedRes = `{
  "data": {
    "seated": false,
    "sections": []
  }
}`

export const verifyTicketRes = `{
  "data": {
    "id": "a1b2c3d4-...",
    "status": "valid",
    "checked_in_at": null,
    "purchased_at": "2026-03-21T10:30:00Z",
    "event": {
      "id": "8db0f243-...",
      "title": "S10MAIC",
      "start_datetime": "2026-03-27T19:00:00+00:00",
      "venue_name": "Mow's"
    },
    "tier": {
      "name": "General Admission",
      "price": 1000
    },
    "customer": {
      "name": "Juan Dela Cruz",
      "email": "juan@example.com"
    }
  }
}`

export const checkInRes = `{
  "data": {
    "id": "a1b2c3d4-...",
    "status": "used",
    "checked_in_at": "2026-03-27T19:15:00Z",
    "event": { "id": "8db0f243-...", "title": "S10MAIC" },
    "customer": { "name": "Juan Dela Cruz" }
  }
}`

export const refundRes = `{
  "data": {
    "id": "a1b2c3d4-...",
    "status": "refunded",
    "event": { "id": "8db0f243-...", "title": "S10MAIC" },
    "tier": { "name": "General Admission", "price": 1000 }
  }
}`

export const createEventRes = `{
  "data": {
    "id": "f47ac10b-58cc-...",
    "title": "Friday Night Comedy",
    "status": "draft",
    "start_datetime": "2026-04-10T20:00:00+08:00",
    "venue_name": "Comedy Bar Manila",
    "address": "Makati Ave, Makati",
    "city": "Manila",
    "latitude": 14.5654,
    "longitude": 121.0287,
    "capacity": 150,
    "event_type": "social",
    "ticket_price": 800
  }
}`

export const checkoutRes = `{
  "data": {
    "checkout_id": "pi_abc123def456",
    "checkout_url": "https://checkout.hanghut.com/...",
    "expires_at": "2026-03-22T00:00:00Z",
    "assigned_seats": [                 // seated events only
      { "section": "Orchestra Left", "row": "D", "seat": 12, "label": "D12" },
      { "section": "Orchestra Left", "row": "D", "seat": 13, "label": "D13" }
    ]
  }
}`

export const listOrdersRes = `{
  "data": {
    "orders": [
      {
        "id": "9d13f49e-...",
        "event": { "id": "bdb74865-...", "title": "Tinda Tindahan" },
        "customer": {
          "name": "Juan Dela Cruz",
          "email": "juan@example.com",
          "phone": "+639171234567"
        },
        "quantity": 1,
        "total_amount": 720,
        "subtotal": 700,
        "status": "completed",
        "payment_method": "GCASH",
        "paid_at": "2026-03-30T08:44:12.267+00:00",
        "created_at": "2026-03-30T08:39:23.276+00:00"
      }
    ],
    "meta": { "page": 1, "per_page": 20, "total": 32, "total_pages": 2, "has_more": true }
  }
}`

export const webhookPayloadRes = `{
  "id": "evt_abc123...",
  "type": "ticket.purchased",
  "created_at": "2026-03-21T10:30:00Z",
  "data": {
    "ticket_id": "a1b2c3d4-...",
    "event_id": "8db0f243-...",
    "customer": { "name": "Juan Dela Cruz" },
    "amount": 1000
  }
}`

export const registerWebhookRes = `{
  "data": {
    "id": "wh_abc123...",
    "url": "https://your-site.com/webhook",
    "events": ["ticket.purchased", "ticket.refunded"],
    "secret": "whsec_a1b2c3d4e5f6...",
    "is_active": true
  }
}`

export const analyticsRes = `{
  "data": {
    "total_revenue": 11856.5,
    "total_tickets_sold": 35,
    "total_orders": 32,
    "total_discounts": 285,
    "date_range": { "from": null, "to": null },
    "events": [
      {
        "id": "bdb74865-...",
        "title": "Tinda Tindahan",
        "start_datetime": "2026-04-14T11:07:00+00:00",
        "capacity": 100,
        "revenue": 4960,
        "tickets_sold": 7,
        "orders": 7,
        "discount_total": 0
      }
    ]
  }
}`

export const promoRes = `{
  "data": {
    "id": "pc_abc123...",
    "code": "EARLYBIRD",
    "discount_type": "percentage",
    "discount_amount": 20,
    "usage_limit": 50,
    "usage_count": 0,
    "is_active": true
  }
}`

export const attendeesRes = `{
  "data": {
    "event": { "id": "8db0f243-...", "title": "S10MAIC" },
    "attendees": [
      {
        "ticket_id": "a1b2c3d4-...",
        "ticket_number": "TK-00042",
        "status": "valid",
        "checked_in_at": null,
        "customer": {
          "name": "Juan Dela Cruz",
          "email": "juan@example.com"
        },
        "tier": { "name": "General Admission", "price": 1000 }
      }
    ],
    "meta": { "page": 1, "total": 85, "has_more": true }
  }
}`
