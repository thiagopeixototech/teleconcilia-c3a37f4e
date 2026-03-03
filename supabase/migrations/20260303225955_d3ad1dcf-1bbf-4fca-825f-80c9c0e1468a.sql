UPDATE linha_operadora 
SET cpf_cnpj = LTRIM(cpf_cnpj, '0')
WHERE cpf_cnpj IS NOT NULL 
  AND cpf_cnpj ~ '^0+\d'
  AND id IN ('d575e4df-1b4b-4c40-841e-dc4e13c64641', 'acf407b0-6487-4c8e-a95f-06a7149d2b51');