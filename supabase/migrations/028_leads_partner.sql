-- Slide 2: Leads — campo parceiro + % fee
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_fee_pct numeric(5,2) DEFAULT 0;
