-- Refresh only the 17 shipped feature-icon rows with filled/duotone artwork.
UPDATE "pricing_card_feature_icons"
SET "svg" = refreshed."svg"
FROM (VALUES
  ('qled', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" opacity=".22" d="M3 4h18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path fill="currentColor" fill-rule="evenodd" d="M7.5 7a4.5 4.5 0 1 0 2.73 8.08L12.15 17l1.41-1.41-1.9-1.9A4.5 4.5 0 0 0 7.5 7Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM15 8h2v6h4v2h-6V8Z"/></svg>'),
  ('oled', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" opacity=".22" d="M2 5h20v14H2z"/><path fill="currentColor" fill-rule="evenodd" d="M7 7a5 5 0 1 0 0 10A5 5 0 0 0 7 7Zm0 2.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6ZM13 8h2v6h4v2h-6V8Zm6-1h2v10h-2V7Z"/></svg>'),
  ('uhd-4k', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" opacity=".2" d="M2 4h20v16H2z"/><path fill="currentColor" d="M4 8h3v4h2V8h2v8H9v-2H4V8Zm9 0h2v3l3-3h2.6l-3.8 3.8L21 16h-2.8L15 12.8V16h-2V8Z"/></svg>'),
  ('dolby-vision', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" opacity=".2" d="M2 4h20v16H2z"/><path fill="currentColor" fill-rule="evenodd" d="M5 7h4a5 5 0 0 1 0 10H5V7Zm2 2v6h2a3 3 0 0 0 0-6H7Zm8-2h4v10h-4a5 5 0 0 1 0-10Zm0 2a3 3 0 0 0 0 6h2V9h-2Z"/></svg>'),
  ('google-tv', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" opacity=".22" d="M3 5h18a2 2 0 0 1 2 2v11H1V7a2 2 0 0 1 2-2Z"/><path fill="currentColor" d="m9 8 7 4-7 4V8Zm-3 11h12v2H6z"/></svg>'),
  ('inverter', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" opacity=".2" d="M12 1a11 11 0 1 1 0 22 11 11 0 0 1 0-22Z"/><path fill="currentColor" d="M3.5 13h4.1l2.3-6.2 4.3 10.1 2.1-4.9h4.2v-2h-5.6l-.7 1.7L9.7 1.3 6.2 11H3.5v2Z"/></svg>'),
  ('no-frost', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" opacity=".2" d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z"/><path fill="currentColor" d="M11 2h2v7.3l6.3-3.65 1 1.74L14 11l6.3 3.61-1 1.74L13 12.7V20h-2v-7.3l-6.3 3.65-1-1.74L10 11 3.7 7.39l1-1.74L11 9.3V2Z"/></svg>'),
  ('energy-a', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" opacity=".2" d="m12 1 9 4v6c0 5.5-3.8 10.2-9 12-5.2-1.8-9-6.5-9-12V5l9-4Z"/><path fill="currentColor" fill-rule="evenodd" d="m12 5-6 13h3l1.1-2.5h3.8L15 18h3L12 5Zm0 5.7 1 2.3h-2l1-2.3Z"/></svg>'),
  ('energy-a-plus', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" opacity=".2" d="m10 1 8 4v6c0 5.2-3.3 9.7-8 12-4.7-2.3-8-6.8-8-12V5l8-4Z"/><path fill="currentColor" fill-rule="evenodd" d="m9 5-5 13h2.8l.8-2.5h3.1l.9 2.5h2.8L9 5Zm0 5.6.8 2.4H8.2l.8-2.4ZM18 7h2v3h3v2h-3v3h-2v-3h-3v-2h3V7Z"/></svg>'),
  ('spin-1400', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" opacity=".2" d="M12 3a9 9 0 1 1-8.5 6H7a6 6 0 1 0 2-2.3V10L3 6l6-4v2a9 9 0 0 1 3-1Z"/><path fill="currentColor" d="M12 7a5 5 0 1 1-4.3 7.5l3-1.7a1.6 1.6 0 1 0 1.3-2.4V7Z"/></svg>'),
  ('wifi', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" opacity=".3" d="M2 8.8a15.7 15.7 0 0 1 20 0l-2.1 2.4a12.5 12.5 0 0 0-15.8 0L2 8.8Z"/><path fill="currentColor" d="M6 13a9.4 9.4 0 0 1 12 0l-2.2 2.4a6.2 6.2 0 0 0-7.6 0L6 13Zm4 4.4a3.2 3.2 0 0 1 4 0L12 20l-2-2.6Z"/></svg>'),
  ('steam', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" opacity=".22" d="M3 17h18v4H3z"/><path fill="currentColor" d="M5.5 16c-2.3-2.5 2.2-4.1.2-6.5C3.8 7.2 6.6 5.3 7.4 3l2.3.8c-1 2.9-2.6 3.7-1.5 5.1 3.3 4-2.8 5.7-.9 7.7L5.5 16Zm6 0c-2.3-2.5 2.2-4.1.2-6.5-1.9-2.3.9-4.2 1.7-6.5l2.3.8c-1 2.9-2.6 3.7-1.5 5.1 3.3 4-2.8 5.7-.9 7.7l-1.8-.6Zm6 0c-2.3-2.5 2.2-4.1.2-6.5l1.9-1.6c3.3 4-2.8 5.7-.9 7.7l-1.2.4Z"/></svg>'),
  ('cordless', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" opacity=".24" d="M7 2h10v14H7z"/><path fill="currentColor" d="M9 4h6v9H9V4Zm1 11h4v6h-4v-6ZM5 6h2v7H5V6Zm12 0h2v7h-2V6Z"/></svg>'),
  ('waterproof', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" opacity=".22" d="M12 1S4 10 4 16a8 8 0 1 0 16 0c0-6-8-15-8-15Z"/><path fill="currentColor" d="M8 15.5c.6 2.3 2 3.5 4.4 3.5 1.4 0 2.5-.5 3.4-1.4l1.4 1.5a6.6 6.6 0 0 1-4.8 2c-3.5 0-5.7-1.8-6.4-5.1l2-.5Z"/></svg>'),
  ('brushless', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" opacity=".2" d="M12 1a11 11 0 1 1 0 22 11 11 0 0 1 0-22Z"/><path fill="currentColor" d="M11 3h2v6.1c1.8-2.2 4.5-3.4 7-2.7l-.5 1.9-5.3 3c2.8.5 5.1 2.4 5.8 5l-2 .5-5.2-3c1 2.7.6 5.6-1.3 7.5L10 20l.1-6.1c-1.8 2.2-4.5 3.4-7 2.7l.5-1.9 5.3-3c-2.8-.5-5.1-2.4-5.8-5l2-.5 5.2 3C9.3 6.5 9.7 3.6 11.6 1.7L13 3h-2Z"/></svg>'),
  ('usb-c-charging', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" opacity=".22" d="M6 5h12a6 6 0 0 1 0 12H6A6 6 0 0 1 6 5Z"/><path fill="currentColor" d="M7 8h10a3 3 0 0 1 0 6H7a3 3 0 0 1 0-6Zm4-7h3l-2 4h3l-5 7 1-5H8l3-6Zm0 16h2v6h-2z"/></svg>'),
  ('digital-display', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" opacity=".22" d="M2 4h20v16H2z"/><path fill="currentColor" d="M5 7h14v10H5V7Zm2 2v6h2V9H7Zm4 0v6h2V9h-2Zm4 0v6h2V9h-2Z"/></svg>')
) AS refreshed("code", "svg")
WHERE "pricing_card_feature_icons"."code" = refreshed."code";

-- Collapse the two old dimension-specific grids into the new visual grid mode.
UPDATE "pricing_card_templates"
SET "config" = jsonb_set("config", '{features,layout}', '"grid-chip"'::jsonb, false)
WHERE "id" IN (
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002'
)
AND "config" #>> '{features,layout}' IN ('grid-2x3', 'grid-3x2');
