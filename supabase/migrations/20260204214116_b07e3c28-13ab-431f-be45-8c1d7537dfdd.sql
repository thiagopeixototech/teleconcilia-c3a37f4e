
-- Atualiza função para evitar duplicação quando admin cria usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Só insere se não existir registro para esse user_id
    INSERT INTO public.usuarios (user_id, nome, email, ativo)
    SELECT 
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.email,
        false
    WHERE NOT EXISTS (
        SELECT 1 FROM public.usuarios WHERE user_id = NEW.id
    );
    RETURN NEW;
END;
$$;
