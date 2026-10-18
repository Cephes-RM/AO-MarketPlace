-- Player.region stores the Albion client's region id ("west", "europe", "east").
-- Earlier seeds wrote "EU" for Europe players; ingestion writes "europe".
UPDATE "Player" SET "region" = 'europe' WHERE "region" = 'EU';
