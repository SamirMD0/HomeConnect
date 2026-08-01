-- Search normalization functions for Arabic and English text.
--
-- Both functions are genuinely IMMUTABLE (translate/regexp_replace/lower are),
-- so they are safe to use inside index expressions.
--
-- NOTE ON unaccent: unaccent() is deliberately NOT used here. It is declared
-- STABLE rather than IMMUTABLE because its behaviour depends on a reconfigurable
-- dictionary, so PostgreSQL refuses it in index expressions. The usual
-- workaround -- wrapping it in a hand-declared IMMUTABLE function -- lies to the
-- planner and silently corrupts indexes if the dictionary ever changes. Its
-- default ruleset also targets Latin scripts and does almost nothing for Arabic,
-- which is the case that matters here.
--
-- TREAT THESE FUNCTIONS AS APPEND-ONLY. Once indexes depend on them, changing a
-- body silently invalidates every dependent index. To change the rules, create
-- hc_search_normalize_v2 and migrate the indexes to it.
--
-- Unicode escapes (U&'\XXXX') are used so this file contains no invisible
-- combining characters:
--   0623 ALEF WITH HAMZA ABOVE   0625 ALEF WITH HAMZA BELOW
--   0622 ALEF WITH MADDA ABOVE   0671 ALEF WASLA
--   0649 ALEF MAKSURA            0629 TEH MARBUTA
--   0627 ALEF                    064A YEH                 0647 HEH
--   064B-0652 tashkeel (harakat) 0640 tatweel
--
-- Additive and idempotent. Touches no data.

CREATE OR REPLACE FUNCTION hc_search_normalize(input text)
RETURNS text AS $$
  SELECT translate(
    regexp_replace(lower(coalesce(input, '')), U&'[\064B-\0652\0640]', '', 'g'),
    U&'\0623\0625\0622\0671\0649\0629',
    U&'\0627\0627\0627\0627\064A\0647'
  );
$$ LANGUAGE SQL IMMUTABLE PARALLEL SAFE;

COMMENT ON FUNCTION hc_search_normalize(text) IS
  'Lowercases, strips tashkeel/tatweel, unifies alef variants, alef maqsura -> yeh, teh marbuta -> heh. IMMUTABLE: safe in index expressions. Append-only: create a _v2 rather than editing.';

-- Digits-only phone form so "70 123-456" matches "70123456".
CREATE OR REPLACE FUNCTION hc_phone_normalize(input text)
RETURNS text AS $$
  SELECT regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g');
$$ LANGUAGE SQL IMMUTABLE PARALLEL SAFE;

COMMENT ON FUNCTION hc_phone_normalize(text) IS
  'Strips every non-digit. IMMUTABLE: safe in index expressions.';
