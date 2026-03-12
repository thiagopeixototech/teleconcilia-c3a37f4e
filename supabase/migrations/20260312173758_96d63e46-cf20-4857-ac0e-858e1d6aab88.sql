CREATE POLICY "Admin can delete audit_log"
ON public.audit_log FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));