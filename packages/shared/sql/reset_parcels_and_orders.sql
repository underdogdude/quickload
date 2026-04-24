-- Remove all parcels and Smartpost order snapshots (users, sender/recipient addresses unchanged).
DELETE FROM orders;
DELETE FROM parcels;
