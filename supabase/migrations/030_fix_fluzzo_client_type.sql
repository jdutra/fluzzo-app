-- Slide 3: remover tipo "Fluzzo" — atualiza clientes existentes para "Cliente"
UPDATE clients SET type = 'Cliente' WHERE type = 'Fluzzo';
