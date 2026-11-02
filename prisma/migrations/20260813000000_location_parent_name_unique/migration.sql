-- Drop global unique on Location.name; allow same name under different parents (e.g. rack & level both "Shelf 1")
DROP INDEX `Location_name_key` ON `Location`;

-- Composite unique: name unique per parent (NULL parent = top-level rack/kardus/pallet)
CREATE UNIQUE INDEX `Location_parentId_name_key` ON `Location`(`parentId`, `name`);
