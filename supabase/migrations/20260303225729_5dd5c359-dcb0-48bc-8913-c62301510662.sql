UPDATE linha_operadora 
SET cpf_cnpj = LPAD(cpf_cnpj, 14, '0')
WHERE cpf_cnpj IS NOT NULL 
  AND cpf_cnpj ~ '^\d+$'
  AND LENGTH(cpf_cnpj) BETWEEN 12 AND 13;

UPDATE linha_operadora 
SET cpf_cnpj = LPAD(cpf_cnpj, 11, '0')
WHERE cpf_cnpj IS NOT NULL 
  AND cpf_cnpj ~ '^\d+$'
  AND LENGTH(cpf_cnpj) BETWEEN 9 AND 10;