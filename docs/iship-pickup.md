# iShip pickup integration decision

## Courier code

Quickload always sends `THP_eParcelX` as `courier_code` when calling iShip's
`POST /api/request_courier` endpoint.

This is an intentional business rule, even though iShip distinguishes
`THP_eParcelX` and `THP_eParcelZ` by parcel-weight criteria. The courier pickup
payload contains only the number of parcels (`parcel`) and has no weight field.
Quickload therefore does not infer a different provider pickup service from its
locally stored parcel weights.

The customer interface must not display either internal courier code or describe
the request as standard versus bulky. Quickload still records the heaviest
parcel weight for validation and operational reference, but that value does not
change the outgoing courier code.

Quickload accepts a maximum heaviest-parcel weight of 30 kg. Exactly 30 kg is
allowed; heavier system parcels are disabled in the UI and rejected by the API.
This validation still does not select `THP_eParcelZ`: every accepted request
uses `THP_eParcelX`.

The courier code is fixed in server code rather than environment configuration
so deployment configuration cannot accidentally change this rule. The legacy
variables `ISHIP_COURIER_CODE`, `ISHIP_COURIER_CODE_BULKY`, and
`ISHIP_MAX_WEIGHT_KG` are no longer read by the application.

## System parcels only

Customers can request pickup only for parcels already registered in Quickload.
The pickup page has no manual-entry mode. Customers choose the pickup contact
and address from their saved sender address book; the primary sender address is
selected by default. The submit API accepts only the saved address ID, reloads
that owned row server-side, and uses its contact and address snapshot for the
courier request. Parcel count, weight, recipient names, and parcel identifiers
are still derived from owned parcel and order rows. Existing historical manual
pickup rows remain readable so removing the booking path does not destroy prior
records.

## Duplicate pickup protection

A system parcel attached to a pickup in `submitting`, `requested`, `assigned`,
`unknown`, or `picked_up` status cannot be attached to another pickup request.
The eligible-parcel query hides it and the submit transaction independently
rejects it, including concurrent submissions. A `picked_up` association remains
blocked permanently. Only `cancelled` and `failed` requests release the parcel
so the customer can retry.

## Webhook registration

iShip support registers only SmartPost's public callback URL. SmartPost handles
its own pickup tickets and relays unmatched callbacks to Quickload at
`/api/webhooks/iship-courier`; iShip is never given the Quickload URL.

The SmartPost-to-Quickload relay signs the exact raw body with HMAC-SHA256 using
`ISHIP_RELAY_SHARED_SECRET`. It sends the Unix timestamp in
`X-SmartPost-Timestamp` and `sha256=<hex>` in `X-SmartPost-Signature`. Quickload
rejects invalid signatures and timestamps outside a five-minute window.

After authentication, Quickload accepts JSON only, requires an exact
`ticketPickupId` match, applies monotonic status transitions, and retains the
raw payload in the webhook audit log. An unknown ticket returns HTTP 202 so the
durable SmartPost relay queue retries after the pickup ticket has been saved.

For production, SmartPost must set `QUICKLOAD_ISHIP_RELAY_URL` to Quickload's
stable HTTPS endpoint and both systems must set the same randomly generated
`ISHIP_RELAY_SHARED_SECRET`. This shared secret belongs to the two owned systems;
it is not supplied to or by iShip.
