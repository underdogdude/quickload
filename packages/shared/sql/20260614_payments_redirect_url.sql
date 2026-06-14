-- Adds payments.redirect_url to persist Beam REDIRECT-action URLs.
-- Methods like KPLUS / MAKE / SCB_EASY / TRUE_MONEY return a deeplink that
-- opens the bank/wallet app; we save it so reloading /pay/[parcelId] doesn't
-- re-create the charge.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS redirect_url text;
