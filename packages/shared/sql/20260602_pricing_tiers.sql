-- Pricing tiers for parcel shipping.
-- weight_up_to_grams: the maximum weight (inclusive) for this tier.
-- price_thb: the sell price in Thai Baht for parcels up to that weight.
-- Lookup: find the row with the smallest weight_up_to_grams >= actual_weight.

CREATE TABLE IF NOT EXISTS pricing_tiers (
  weight_up_to_grams integer PRIMARY KEY,
  price_thb          integer NOT NULL
);

INSERT INTO pricing_tiers (weight_up_to_grams, price_thb) VALUES
  (    20,  28),
  (   100,  32),
  (   250,  36),
  (   500,  45),
  (  1000,  57),
  (  1500,  70),
  (  2000,  83),
  (  2500,  85),
  (  3000,  90),
  (  3500,  94),
  (  4000, 102),
  (  4500, 102),
  (  5000, 102),
  (  5500, 111),
  (  6000, 119),
  (  6500, 128),
  (  7000, 136),
  (  7500, 145),
  (  8000, 153),
  (  8500, 162),
  (  9000, 170),
  (  9500, 179),
  ( 10000, 187),
  ( 11000, 196),
  ( 12000, 204),
  ( 13000, 213),
  ( 14000, 221),
  ( 15000, 230),
  ( 16000, 238),
  ( 17000, 247),
  ( 18000, 255),
  ( 19000, 264),
  ( 20000, 272),
  ( 21000, 281),
  ( 22000, 289),
  ( 23000, 298),
  ( 24000, 306),
  ( 25000, 323),
  ( 26000, 340),
  ( 27000, 357),
  ( 28000, 374),
  ( 29000, 391),
  ( 30000, 408)
ON CONFLICT (weight_up_to_grams) DO UPDATE SET price_thb = EXCLUDED.price_thb;
