ALTER TABLE section_standard_evaluations ADD COLUMN requirements_json LONGTEXT NULL AFTER pass_threshold;
-- Backfill existing rows with empty array to avoid null
UPDATE section_standard_evaluations SET requirements_json = '[]' WHERE requirements_json IS NULL;
