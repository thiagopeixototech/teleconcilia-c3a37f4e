-- Corrigir política permissiva de INSERT no audit_log
DROP POLICY IF EXISTS "Authenticated users can insert audit_log" ON public.audit_log;

-- Agora com restrição: usuário só pode inserir logs para seu próprio user_id
CREATE POLICY "Authenticated users can insert own audit_log"
    ON public.audit_log FOR INSERT
    TO authenticated
    WITH CHECK (usuario_id = auth.uid());