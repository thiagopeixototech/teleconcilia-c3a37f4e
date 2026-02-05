-- Add new status values for contestation workflow
ALTER TYPE status_interno ADD VALUE IF NOT EXISTS 'contestacao_enviada';
ALTER TYPE status_interno ADD VALUE IF NOT EXISTS 'contestacao_procedente';
ALTER TYPE status_interno ADD VALUE IF NOT EXISTS 'contestacao_improcedente';