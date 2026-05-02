-- Slide 5: ProjectConsultants — data de início do recebimento + papel (renomear role UI)
ALTER TABLE project_consultants
  ADD COLUMN IF NOT EXISTS billing_start_date date;
