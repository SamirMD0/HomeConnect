ALTER TYPE "ServiceAuditRecordType" ADD VALUE IF NOT EXISTS 'PRICING_CARD_FEATURE_ICON';

CREATE TABLE IF NOT EXISTS "pricing_card_feature_icons" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "category" TEXT,
  "svg" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById" UUID,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pricing_card_feature_icons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pricing_card_feature_icons_code_check" CHECK ("code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT "pricing_card_feature_icons_svg_size_check" CHECK (octet_length("svg") BETWEEN 1 AND 8192)
);
CREATE UNIQUE INDEX IF NOT EXISTS "pricing_card_feature_icons_code_key" ON "pricing_card_feature_icons"("code");
CREATE INDEX IF NOT EXISTS "pricing_card_feature_icons_category_sortOrder_idx" ON "pricing_card_feature_icons"("category", "sortOrder");
CREATE INDEX IF NOT EXISTS "pricing_card_feature_icons_isActive_idx" ON "pricing_card_feature_icons"("isActive");

DO $$ BEGIN ALTER TABLE "pricing_card_feature_icons" ADD CONSTRAINT "pricing_card_feature_icons_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "pricing_card_feature_icons" ADD CONSTRAINT "pricing_card_feature_icons_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO "pricing_card_feature_icons" ("id", "code", "label", "category", "svg", "sortOrder") VALUES
('10000000-0000-4000-8000-000000000001','qled','QLED','tv','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4M8 9h8v4H8z"/></svg>',10),
('10000000-0000-4000-8000-000000000002','oled','OLED','tv','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="11" r="7"/><path d="M5 20h14M9 11h6"/></svg>',20),
('10000000-0000-4000-8000-000000000003','uhd-4k','UHD 4K','tv','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="4" width="20" height="15" rx="2"/><path d="M7 9v4h4M14 9v5M18 9l-4 5M15 12h3"/></svg>',30),
('10000000-0000-4000-8000-000000000004','dolby-vision','Dolby Vision','tv','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 8v8c3 0 5-1 5-4s-2-4-5-4zM16 8v8"/></svg>',40),
('10000000-0000-4000-8000-000000000005','google-tv','Google TV','tv','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m9 9 6 3-6 3z"/></svg>',50),
('10000000-0000-4000-8000-000000000006','inverter','Inverter','appliance','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 12h3l2-5 4 10 2-5h5"/><circle cx="12" cy="12" r="9"/></svg>',60),
('10000000-0000-4000-8000-000000000007','no-frost','No Frost','appliance','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v20M4 7l16 10M20 7 4 17M8 4l4 3 4-3M8 20l4-3 4 3"/></svg>',70),
('10000000-0000-4000-8000-000000000008','energy-a','Energy A','energy','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m12 3-8 18h4l2-5h4l2 5h4zM11 12h2"/></svg>',80),
('10000000-0000-4000-8000-000000000009','energy-a-plus','Energy A+','energy','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m9 3-7 18h4l2-5h4l2 5h4L11 3zM9 12h2M19 7v6M16 10h6"/></svg>',90),
('10000000-0000-4000-8000-000000000010','spin-1400','1400 RPM','appliance','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"/><path d="M8 9c5-3 8 2 5 5-2 2-5 0-4-2 1-2 4-1 4 1"/></svg>',100),
('10000000-0000-4000-8000-000000000011','wifi','Wi-Fi','connectivity','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0M9 15a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>',110),
('10000000-0000-4000-8000-000000000012','steam','Steam','appliance','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M7 20c-3-3 3-5 0-8S10 7 8 3M13 20c-3-3 3-5 0-8s3-5 1-9M19 20c-3-3 3-5 0-8"/></svg>',120),
('10000000-0000-4000-8000-000000000013','cordless','Cordless','power','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 3h8v12H8zM10 18h4v3h-4zM5 7h3M16 7h3"/></svg>',130),
('10000000-0000-4000-8000-000000000014','waterproof','Waterproof','durability','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13zM8 16c1 2 3 3 5 3"/></svg>',140),
('10000000-0000-4000-8000-000000000015','brushless','Brushless','power','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="4"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M19 5l-4 4M9 15l-4 4"/></svg>',150),
('10000000-0000-4000-8000-000000000016','usb-c-charging','USB-C Charging','power','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="7" width="18" height="10" rx="5"/><path d="M10 10h4v4h-4zM12 4v3M12 17v3"/></svg>',160),
('10000000-0000-4000-8000-000000000017','digital-display','Digital Display','display','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h2v4H7zM11 10h2v4h-2zM15 10h2v4h-2z"/></svg>',170)
ON CONFLICT ("id") DO NOTHING;
