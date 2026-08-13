# SuDan Empire — Database Upgrade

This version adds persistent PostgreSQL storage to the storefront/admin platform.

## Database
The schema is in `schema.sql` and stores:
- admin users
- perfume products
- advertising applications/media
- payment references/status
- advert start/expiry dates
- customer reviews
- store orders

## Setup
1. Use a PostgreSQL database (Supabase is a convenient managed option).
2. Run `schema.sql` in the database SQL editor.
3. Copy `.env.example` to `.env`.
4. Fill in `DATABASE_URL`, `PAYSTACK_PUBLIC_KEY`, and `PAYSTACK_SECRET_KEY`.
5. Use Node.js 22+.
6. Run `npm install`.
7. Run `npm start`.
8. Open `/admin`.

The current prototype login remains:
Username: `SuDan Empire`
Password: `@SuDan212`

## Paystack
The server initializes transactions with the secret key, stores the reference, verifies transactions server-side, and accepts signed webhook events. Configure the Paystack webhook URL as:
`https://YOUR-DOMAIN/api/paystack/webhook`

Paystack amounts are stored in the smallest currency unit (kobo).

## Production security still required
- Replace the prototype admin credential check with real password hashing + sessions/JWT.
- Add CSRF/rate-limit protection.
- Store uploaded media in durable object storage rather than local disk.
- Restrict upload MIME types and scan files.
- Add database-backed advertiser/customer authentication.
- Add audit logs and backups.


## User-supplied product photos
The storefront now uses crops from the user's supplied stock photo for products that are clearly visible. Products without a matching photo show 'Product photo coming soon' until an exact photo is supplied. Selling prices follow the user's spreadsheet.


## Checkout upgrade
The storefront now has a persistent local cart, quantity controls, checkout fields, delivery options, order creation API, and WhatsApp order handoff. The admin dashboard includes an Orders section. Live Paystack checkout for customer orders should be connected next using the same server-side pattern as advert payments.

## Full customer purchase flow
Customer flow is now wired as:
1. Add products to cart.
2. Review quantities and delivery fee.
3. Enter customer and delivery details.
4. Create an order in PostgreSQL.
5. Initialize a Paystack transaction server-side.
6. Redirect the customer to Paystack's secure hosted checkout.
7. Return to `payment-success.html` and verify the reference server-side.
8. Paystack webhook marks the order paid/processing.
9. Admin dashboard can view the order.
10. Customer can also send the order details to SuDan Empire WhatsApp as an alternative/manual channel.

Before accepting live money, set real `DATABASE_URL`, `PAYSTACK_SECRET_KEY`, and `PAYSTACK_PUBLIC_KEY` in `.env`, deploy over HTTPS, and configure the Paystack webhook URL to `/api/paystack/webhook`.
