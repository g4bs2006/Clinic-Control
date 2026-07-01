-- ============================================================================
-- Clinic Control — dump de DADOS (gerado 2026-07-01 da conta Supabase antiga).
-- Rodar DEPOIS de aplicar o schema (migrations 0001..0010 ou dump/schema.sql).
--
-- NAO inclui (ver migration-notes.md):
--  - clinic_agents / agent_stages (26/307) + arquivos do Storage (631): tudo
--    'imported' -> recriar RE-IMPORTANDO as pastas das clinicas pelo app.
--  - usuarios do Auth (logins da equipe): recriar no painel do projeto novo.
--  - a chave de criptografia do token da Helena (env ENCRYPTION/AES): o token
--    abaixo so descriptografa se a MESMA chave for usada no deploy novo.
-- ============================================================================

-- ---- clinics (29) ----------------------------------------------------------
insert into clinics (id,name,address,city,state,region,lat,lng,mode,contract_status,system,created_at,updated_at) values
('252d7ba8-56fd-4847-ab42-4e858df2067d','Volte a Sorrir/Matheus Vilela',NULL,NULL,NULL,NULL,NULL,NULL,'manual','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('add808e4-e75e-4585-9094-761a00d09910','Di Dea',NULL,NULL,NULL,NULL,NULL,NULL,'manual','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('9229bfd3-7aed-4328-8d37-84ed6515f686','Nucleodente',NULL,NULL,NULL,NULL,NULL,NULL,'manual','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('f3f4b4cd-6f25-442a-a4bd-79f74619b776','Arte Riso','Rua Rui Barbosa, São Joaquim','Teresina','PI','Nordeste','-5.0529822','-42.8317369','manual','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('a70e1a8b-ad4f-4ad0-945b-7335f47a9cef','Atos odontologia','Rua Leonor Pinheiro da Silva, 29, Parque do Colégio','Jundiaí','SP','Sudeste','-23.1837591','-46.8984974','manual','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('668cebda-3085-4052-a45e-1205cf0849a0','Bazacas','Avenida espanha, 333, Centro','Arroio dos Ratos','RS','Sul','-30.0916014','-51.7322237','manual','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('058dae49-0712-44d8-b8c9-9a7076833fc3','Brasdent','Rua Doutor Montaury, 1271, Madureira','Caxias do Sul','RS','Sul','-29.1589381','-51.1802971','manual','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('1410b56b-ff20-4dcd-973b-c2fddd3eb53e','Conquista Sorrisos',NULL,NULL,NULL,NULL,NULL,NULL,'manual','active','Google Agenda','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('22cb0aa0-9598-48fe-9236-38a1983177a3','HB Odontologia',NULL,NULL,NULL,NULL,NULL,NULL,'manual','active','Google Agenda','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('863ed4dd-0410-46d2-acaf-29ab7c9b5741','Atualle','Rua José Nicolau de Queiroz, 266, Centro','Conselheiro Lafaiete','MG','Sudeste','-20.659468','-43.7909648','manual','active','Google Agenda','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('821d32c7-6f79-4181-9e56-f18058150704','Instituto Frazao','Rua Rodrigues de Carvalho, 166, centro','Mamanguape','PB','Nordeste','-6.8333791','-35.1184101','manual','active','Google Agenda','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('5eef70c8-d544-4233-9ae2-1460794eaa0a','Isaac Luis','Quadra Saci, 2, Saci','Teresina','PI','Nordeste','-5.1368448','-42.7998633','manual','active','Google Agenda','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('2cfabf90-8c1f-4e08-b75a-8fda968ead30','Luiz Figueredo','Rua Jurubatuba, 1350, Centro','São Bernardo do Campo','SP','Sudeste','-23.7093603','-46.5535751','manual','active','Google Agenda','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('7b8efa11-06a3-4bf6-964b-25c8fdb8ae56','FP Prime','Rua Cônego Januário Barbosa, 247, Jardim Vergueiro','Sorocaba','SP','Sudeste','-23.5084216','-47.4573762','manual','active','Google Agenda','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('5679a01d-5a5d-4aa7-a087-fbe46bd3e4e8','Nuova Odontologia','Rua Mississipi, 170, Jardim Canadá','Nova Lima','MG','Sudeste','-19.9854089','-43.8470691','manual','active','Google Agenda','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('1b262190-ac6e-4a8c-89bf-9965d453dfd3','Odontocompany Conchal e Mogi Mirim','Rua Nossa Senhora Aparecida, 90, Vila Aparecida','Conchal','SP','Sudeste','-22.337512','-47.172927','manual','active','Google Agenda','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('fd609f55-efc5-49b1-9150-e71acaab4af9','Oral Concept/Oral conceito',NULL,NULL,NULL,NULL,NULL,NULL,'manual','active','Simples Dental','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('8711c34d-539b-4fde-8f7f-4d68924ae537','Oral Foz','Avenida República Argentina, 2886, Maracanã','Foz do Iguaçu','PR','Sul','-25.5344006','-54.5794834','manual','active','e-Clínica','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('d03780e2-c90d-4908-96fa-a9c39d342d6b','Fernanda Vasconcellos','Avenida Marechal Fontenelle, 3975, Realengo','Rio de Janeiro','RJ','Sudeste','-22.878035','-43.4180194','manual','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('9886b5cd-d461-4909-831a-a5177f9ad59b','Francisco Junior','Rua Joaquim Rodrigues Nogueira, 265, Centro','Araripina','PE','Nordeste','-7.5757495','-40.502906','manual','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('1cde9063-a5a7-4d64-9ed4-a5403f3a570d','OB Clinic','Rua Orestes Guimarães, 828, América','Joinville','SC','Sul','-26.2898954','-48.8451575','manual','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('07f61623-2908-46d4-9a46-d81bdf789b70','Odontomoraes','Rua 17 C, Setor Garavelo','Aparecida de Goiânia','GO','Centro-Oeste','-16.7697912','-49.3424108','manual','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('e18c0153-589c-4300-8505-4074a77cd11b','Prime Dente Meier','Rua Dias da Cruz, Méier','Rio de Janeiro','RJ','Sudeste','-22.904161','-43.2854461','manual','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('b252b6f3-0a60-461c-bd3f-ffb7649fe16a','Prime Odontocenter','Avenida Jornalista Umberto Calderaro Filho, 7, Adrianópolis','Manaus','AM','Norte','-3.0896241','-60.0091631','manual','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('3d0a256c-11aa-48f9-935e-008710054463','Valença Centro Saúde','Rua Benjamin Constant, Centro','Imperatriz','MA','Nordeste','-5.5296523','-47.487472','manual','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('58c0f41f-5219-434f-9e75-38f34807cd05','Yamar Odontologia','Rua Pernambuco, Centro','Londrina','PR','Sul','-23.3137522','-51.1627583','manual','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('d9e6f98f-29c5-4184-9ba9-fdf7e7f56d39','Clinica Biosorriso','Avenida Caraíbas, Centro','Irecê','BA','Nordeste','-11.3034965','-41.8557929','manual','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('d1820052-a951-4808-bf2a-caac890a8b71','Clinica Vassoler','Avenida Barber Greene, 931A, Jardim Santa Clara','Guarulhos','SP','Sudeste','-23.4675941','-46.5277704','manual','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00'),
('5e22b250-4da4-4d05-9410-16bd8bb192e9','Dr. João Roberto Furtado','Avenida Amintas Barros, 3700, Lagoa Nova','Natal','RN','Nordeste','-5.8217708','-35.2058803','auto','active','Clinicorp','2026-06-30 12:38:27.126419+00','2026-07-01 11:40:54.596056+00')
on conflict (id) do nothing;

-- ---- clinic_integrations (1) — token so descriptografa com a MESMA chave ----
insert into clinic_integrations (clinic_id,helena_token_encrypted,panel_id,company_id,last_sync_at,created_at,updated_at) values
('5e22b250-4da4-4d05-9410-16bd8bb192e9','IT+rWqyHbNNn8+hD:DBNa/8rqJ/2BGwXezxmp2Q==:e0YhofXsjthiwBsq1a0MO88sVVt5R2QkxKsCTKT/cZWYVCUqD82cB2N8k92LGw==','2e5dfacb-af86-4ac6-9fb3-5041480831c8','8015eac0-301d-4ea3-924b-e0bf9eef1907','2026-06-30 18:16:09.323+00','2026-06-30 18:16:09.398455+00','2026-06-30 18:16:09.398455+00')
on conflict (clinic_id) do nothing;

-- ---- funnel_steps (9) — sobrescreve o seed da migration ---------------------
delete from funnel_steps;
insert into funnel_steps (id,name,position,counts_as_scheduling,counts_as_closing) values
('af99813b-80ee-4f45-813e-249295dc8c3b','Leads',1,false,false),
('3451877e-2ae9-4ab5-80be-1d5d5b264557','Agendados',2,true,false),
('6a1f0ee5-d9bc-4fb1-a63c-1b45dd546609','Não Agendados',3,false,false),
('a3ac802a-3d19-460e-815f-23ed3280911c','Reagendados',4,true,false),
('f116fba6-81fb-4d5a-8fa9-6ac41f544283','Cancelados',5,false,false),
('b2915a7f-b044-434c-a7ad-95f9681f53fd','Faltosos',6,false,false),
('e051a727-c1ff-4ebe-8048-39c2a43405cd','Orçamento em Aberto',7,false,false),
('7188fa1e-f6d2-4807-bc5f-6f6f9cecf875','Compareceram e Não Fecharam',8,false,false),
('611d8cf7-45cf-4f6f-bbcf-667766f19288','Compareceram e Fecharam',9,false,true);

-- ---- status_rules (5) — EDITADO no app; sobrescreve o seed -------------------
delete from status_rules;
insert into status_rules (id,label,rate_min,rate_max,color,position) values
('dec693e9-c8fb-4aae-bc4e-ced040b52b3b','Risco de Churn',0,0.05,'#9ca3af',1),
('dfa012ff-8d0e-4fc5-a3a5-17535ab4cd81','Preocupante',0.05,0.09,'#f97316',2),
('26ea8a8e-5144-4633-8c10-b675bcf0db21','Atenção',0.09,0.11,'#eab308',3),
('bab78390-7171-49ef-811d-66afa65bc81c','Bom',0.11,0.13,'#3b82f6',4),
('fa603b22-d4a3-4a45-841c-94dabb1c91d7','Ótimo',0.13,1.01,'#22c55e',5);

-- ---- whatsapp_team_members (1) ---------------------------------------------
insert into whatsapp_team_members (id,phone,name,clinic_id,created_at) values
('789ad02c-dca3-4b65-9f5b-74addbf2d17b','31930175','Equipe (responder)',NULL,'2026-07-01 13:21:06.793604+00')
on conflict do nothing;

-- ---- monthly_snapshots (46) ------------------------------------------------
insert into monthly_snapshots (id,clinic_id,year_month,leads,scheduled,rate,status,status_override,source,revenue,step_counts,frozen,created_at,updated_at) values
('0e148716-4853-48dc-b9ef-32141312c4f2','a70e1a8b-ad4f-4ad0-945b-7335f47a9cef','2026-05',122,0,0,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-06-30 12:38:27.126419+00'),
('c545db5c-724f-4975-b82d-80835d7394eb','821d32c7-6f79-4181-9e56-f18058150704','2026-05',208,3,0.014423076923076924,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-06-30 12:38:27.126419+00'),
('9e7e8047-bdf2-49b5-92e8-2b2e5a555a4b','252d7ba8-56fd-4847-ab42-4e858df2067d','2026-05',634,13,0.02050473186119874,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-06-30 12:38:27.126419+00'),
('fbf45e68-402d-4a0d-9f33-b120a8864241','3d0a256c-11aa-48f9-935e-008710054463','2026-05',57,3,0.05263157894736842,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-06-30 12:38:27.126419+00'),
('024b3d81-93a8-4bce-86c9-2100c4e7bca7','add808e4-e75e-4585-9094-761a00d09910','2026-05',231,14,0.06060606060606061,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-06-30 12:38:27.126419+00'),
('18285932-055a-41f5-b911-2dbef89f18fe','58c0f41f-5219-434f-9e75-38f34807cd05','2026-05',65,4,0.06153846153846154,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-06-30 12:38:27.126419+00'),
('1037d49b-2853-4fb2-9e6c-b1333f256cfc','058dae49-0712-44d8-b8c9-9a7076833fc3','2026-05',584,40,0.0684931506849315,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-06-30 12:38:27.126419+00'),
('a8c26418-e942-49d5-8bde-856af7633681','f3f4b4cd-6f25-442a-a4bd-79f74619b776','2026-05',278,20,0.07194244604316546,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-06-30 12:38:27.126419+00'),
('a9ba8a6e-fee6-410a-82c1-8b6d7144a321','1410b56b-ff20-4dcd-973b-c2fddd3eb53e','2026-05',569,43,0.07557117750439367,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-06-30 12:38:27.126419+00'),
('e62bd149-2246-4d25-b1ef-c8ccab2fafd8','5eef70c8-d544-4233-9ae2-1460794eaa0a','2026-05',388,35,0.09020618556701031,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-06-30 12:38:27.126419+00'),
('4bf9a41f-7636-4635-8a65-da7522927d4b','07f61623-2908-46d4-9a46-d81bdf789b70','2026-05',185,21,0.11351351351351352,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-06-30 12:38:27.126419+00'),
('0cffb155-f510-4335-b1eb-19717fecac1d','e18c0153-589c-4300-8505-4074a77cd11b','2026-05',182,24,0.13186813186813187,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-06-30 12:38:27.126419+00'),
('77aef9f0-857e-4b0c-8729-d5109879864d','1cde9063-a5a7-4d64-9ed4-a5403f3a570d','2026-05',671,91,0.13561847988077497,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-06-30 12:38:27.126419+00'),
('cdbaa49c-1f01-48db-9136-f11c8ec46b4a','668cebda-3085-4052-a45e-1205cf0849a0','2026-05',241,39,0.16182572614107885,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-06-30 12:38:27.126419+00'),
('b0eca0f8-c8c5-4144-9360-64111b143487','863ed4dd-0410-46d2-acaf-29ab7c9b5741','2026-05',248,57,0.22983870967741934,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-06-30 12:38:27.126419+00'),
('c53e969f-6091-48f7-aadb-a7dcfe740aec','9886b5cd-d461-4909-831a-a5177f9ad59b','2026-05',172,54,0.313953488372093,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-06-30 12:38:27.126419+00'),
('ead292c7-e61d-4933-9a04-a1a816e4f613','f3f4b4cd-6f25-442a-a4bd-79f74619b776','2026-04',276,20,0.07246376811594203,NULL,NULL,'manual',0,NULL,true,'2026-06-30 13:43:08.478154+00','2026-06-30 13:43:08.701015+00'),
('1ee226e4-4f12-47ae-8d5a-eced0a329d86','5e22b250-4da4-4d05-9410-16bd8bb192e9','2026-05',0,0,0,'Risco Churn',NULL,'auto',0,'[{"count": 0, "title": "Leads"}, {"count": 0, "title": "Agendados"}, {"count": 0, "title": "Não Agendados"}, {"count": 0, "title": "Reagendados"}, {"count": 0, "title": "Cancelados"}, {"count": 0, "title": "Faltosos"}, {"count": 0, "title": "Orçamento em Aberto"}, {"count": 0, "title": "Compareceram e Não Fecharam"}, {"count": 0, "title": "Compareceram e Fecharam"}]',true,'2026-06-30 18:17:51.107404+00','2026-06-30 18:17:51.107404+00'),
('b2745cea-ffb6-4c34-ac33-1f452dac0515','5e22b250-4da4-4d05-9410-16bd8bb192e9','2026-04',0,0,0,'Risco Churn',NULL,'auto',0,'[{"count": 0, "title": "Leads"}, {"count": 0, "title": "Agendados"}, {"count": 0, "title": "Não Agendados"}, {"count": 0, "title": "Reagendados"}, {"count": 0, "title": "Cancelados"}, {"count": 0, "title": "Faltosos"}, {"count": 0, "title": "Orçamento em Aberto"}, {"count": 0, "title": "Compareceram e Não Fecharam"}, {"count": 0, "title": "Compareceram e Fecharam"}]',true,'2026-06-30 18:17:51.501321+00','2026-06-30 18:17:51.501321+00'),
('d04a19b3-4f02-479e-a2bb-0688f9423552','5e22b250-4da4-4d05-9410-16bd8bb192e9','2026-03',0,0,0,'Risco Churn',NULL,'auto',0,'[{"count": 0, "title": "Leads"}, {"count": 0, "title": "Agendados"}, {"count": 0, "title": "Não Agendados"}, {"count": 0, "title": "Reagendados"}, {"count": 0, "title": "Cancelados"}, {"count": 0, "title": "Faltosos"}, {"count": 0, "title": "Orçamento em Aberto"}, {"count": 0, "title": "Compareceram e Não Fecharam"}, {"count": 0, "title": "Compareceram e Fecharam"}]',true,'2026-06-30 18:17:52.117084+00','2026-06-30 18:17:52.117084+00'),
('d29e3a7d-e27a-46f4-9f57-32744043aa45','5e22b250-4da4-4d05-9410-16bd8bb192e9','2026-02',0,0,0,'Risco Churn',NULL,'auto',0,'[{"count": 0, "title": "Leads"}, {"count": 0, "title": "Agendados"}, {"count": 0, "title": "Não Agendados"}, {"count": 0, "title": "Reagendados"}, {"count": 0, "title": "Cancelados"}, {"count": 0, "title": "Faltosos"}, {"count": 0, "title": "Orçamento em Aberto"}, {"count": 0, "title": "Compareceram e Não Fecharam"}, {"count": 0, "title": "Compareceram e Fecharam"}]',true,'2026-06-30 18:17:52.738299+00','2026-06-30 18:17:52.738299+00'),
('8d89388c-4969-45c0-b7d8-a5874aeb6197','5e22b250-4da4-4d05-9410-16bd8bb192e9','2026-01',0,0,0,'Risco Churn',NULL,'auto',0,'[{"count": 0, "title": "Leads"}, {"count": 0, "title": "Agendados"}, {"count": 0, "title": "Não Agendados"}, {"count": 0, "title": "Reagendados"}, {"count": 0, "title": "Cancelados"}, {"count": 0, "title": "Faltosos"}, {"count": 0, "title": "Orçamento em Aberto"}, {"count": 0, "title": "Compareceram e Não Fecharam"}, {"count": 0, "title": "Compareceram e Fecharam"}]',true,'2026-06-30 18:17:53.382217+00','2026-06-30 18:17:53.382217+00'),
('d877b2e9-a9fa-4ac6-83d4-cebf434db47f','5e22b250-4da4-4d05-9410-16bd8bb192e9','2025-12',0,0,0,'Risco Churn',NULL,'auto',0,'[{"count": 0, "title": "Leads"}, {"count": 0, "title": "Agendados"}, {"count": 0, "title": "Não Agendados"}, {"count": 0, "title": "Reagendados"}, {"count": 0, "title": "Cancelados"}, {"count": 0, "title": "Faltosos"}, {"count": 0, "title": "Orçamento em Aberto"}, {"count": 0, "title": "Compareceram e Não Fecharam"}, {"count": 0, "title": "Compareceram e Fecharam"}]',true,'2026-06-30 18:17:53.998902+00','2026-06-30 18:17:53.998902+00'),
('293847c8-6bed-4944-b415-3d5c14f09fd0','821d32c7-6f79-4181-9e56-f18058150704','2026-06',131,18,0.13740458015267176,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-07-01 11:14:59.476888+00'),
('32c6c76f-032b-4998-8df4-88868d09fed5','5e22b250-4da4-4d05-9410-16bd8bb192e9','2025-11',0,0,0,'Risco Churn',NULL,'auto',0,'[{"count": 0, "title": "Leads"}, {"count": 0, "title": "Agendados"}, {"count": 0, "title": "Não Agendados"}, {"count": 0, "title": "Reagendados"}, {"count": 0, "title": "Cancelados"}, {"count": 0, "title": "Faltosos"}, {"count": 0, "title": "Orçamento em Aberto"}, {"count": 0, "title": "Compareceram e Não Fecharam"}, {"count": 0, "title": "Compareceram e Fecharam"}]',true,'2026-06-30 18:17:54.597148+00','2026-06-30 18:17:54.597148+00'),
('aee466e7-ad20-4765-8051-aa94a9706c70','5e22b250-4da4-4d05-9410-16bd8bb192e9','2025-10',0,0,0,'Risco Churn',NULL,'auto',0,'[{"count": 0, "title": "Leads"}, {"count": 0, "title": "Agendados"}, {"count": 0, "title": "Não Agendados"}, {"count": 0, "title": "Reagendados"}, {"count": 0, "title": "Cancelados"}, {"count": 0, "title": "Faltosos"}, {"count": 0, "title": "Orçamento em Aberto"}, {"count": 0, "title": "Compareceram e Não Fecharam"}, {"count": 0, "title": "Compareceram e Fecharam"}]',true,'2026-06-30 18:17:54.968342+00','2026-06-30 18:17:54.968342+00'),
('c34b2d30-36a6-4425-af8f-83afc1ddfd67','5e22b250-4da4-4d05-9410-16bd8bb192e9','2025-09',0,0,0,'Risco Churn',NULL,'auto',0,'[{"count": 0, "title": "Leads"}, {"count": 0, "title": "Agendados"}, {"count": 0, "title": "Não Agendados"}, {"count": 0, "title": "Reagendados"}, {"count": 0, "title": "Cancelados"}, {"count": 0, "title": "Faltosos"}, {"count": 0, "title": "Orçamento em Aberto"}, {"count": 0, "title": "Compareceram e Não Fecharam"}, {"count": 0, "title": "Compareceram e Fecharam"}]',true,'2026-06-30 18:17:55.349272+00','2026-06-30 18:17:55.349272+00'),
('57163822-172e-48d9-ab1d-6151dc6d5709','5e22b250-4da4-4d05-9410-16bd8bb192e9','2025-08',0,0,0,'Risco Churn',NULL,'auto',0,'[{"count": 0, "title": "Leads"}, {"count": 0, "title": "Agendados"}, {"count": 0, "title": "Não Agendados"}, {"count": 0, "title": "Reagendados"}, {"count": 0, "title": "Cancelados"}, {"count": 0, "title": "Faltosos"}, {"count": 0, "title": "Orçamento em Aberto"}, {"count": 0, "title": "Compareceram e Não Fecharam"}, {"count": 0, "title": "Compareceram e Fecharam"}]',true,'2026-06-30 18:17:55.720296+00','2026-06-30 18:17:55.720296+00'),
('027f9887-f62b-4d4c-8cc3-e93891a9b45e','5e22b250-4da4-4d05-9410-16bd8bb192e9','2025-07',0,0,0,'Risco Churn',NULL,'auto',0,'[{"count": 0, "title": "Leads"}, {"count": 0, "title": "Agendados"}, {"count": 0, "title": "Não Agendados"}, {"count": 0, "title": "Reagendados"}, {"count": 0, "title": "Cancelados"}, {"count": 0, "title": "Faltosos"}, {"count": 0, "title": "Orçamento em Aberto"}, {"count": 0, "title": "Compareceram e Não Fecharam"}, {"count": 0, "title": "Compareceram e Fecharam"}]',true,'2026-06-30 18:17:56.130136+00','2026-06-30 18:17:56.130136+00'),
('1d009e1a-03e4-4b48-b6b2-cdc14d879d05','5e22b250-4da4-4d05-9410-16bd8bb192e9','2025-06',0,0,0,'Risco Churn',NULL,'auto',0,'[{"count": 0, "title": "Leads"}, {"count": 0, "title": "Agendados"}, {"count": 0, "title": "Não Agendados"}, {"count": 0, "title": "Reagendados"}, {"count": 0, "title": "Cancelados"}, {"count": 0, "title": "Faltosos"}, {"count": 0, "title": "Orçamento em Aberto"}, {"count": 0, "title": "Compareceram e Não Fecharam"}, {"count": 0, "title": "Compareceram e Fecharam"}]',true,'2026-06-30 18:17:56.492414+00','2026-06-30 18:17:56.492414+00'),
('acbb3fed-b60b-4d6e-a92e-65d77a918e45','252d7ba8-56fd-4847-ab42-4e858df2067d','2026-06',292,14,0.04794520547945205,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-07-01 11:14:59.476888+00'),
('3ddf2363-9fdc-4cab-8f9e-0f0f02b60a25','3d0a256c-11aa-48f9-935e-008710054463','2026-06',30,0,0,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-07-01 11:14:59.476888+00'),
('6644a133-55f3-4857-93d9-809b171e2abf','add808e4-e75e-4585-9094-761a00d09910','2026-06',188,14,0.07446808510638298,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-07-01 11:14:59.476888+00'),
('a94bf545-b1a5-4ee7-95c0-801ae38eb39b','058dae49-0712-44d8-b8c9-9a7076833fc3','2026-06',537,57,0.10614525139664804,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-07-01 11:14:59.476888+00'),
('09f5960e-7c10-4c07-b68f-08e755051bcc','f3f4b4cd-6f25-442a-a4bd-79f74619b776','2026-06',292,26,0.08904109589041095,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-07-01 11:14:59.476888+00'),
('4e08743a-1b8e-4f2e-9662-22e05ae6dfc3','1410b56b-ff20-4dcd-973b-c2fddd3eb53e','2026-06',346,18,0.05202312138728324,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-07-01 11:14:59.476888+00'),
('ad8b2fb4-8fef-456b-8196-f96e0a1252eb','5eef70c8-d544-4233-9ae2-1460794eaa0a','2026-06',280,35,0.125,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-07-01 11:14:59.476888+00'),
('e305cc3e-fddf-4ad6-9dc8-c0db46df0f21','07f61623-2908-46d4-9a46-d81bdf789b70','2026-06',178,25,0.1404494382022472,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-07-01 11:14:59.476888+00'),
('9856642b-1d2f-4a10-824a-11fa94c26be9','e18c0153-589c-4300-8505-4074a77cd11b','2026-06',235,31,0.13191489361702127,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-07-01 11:14:59.476888+00'),
('a650b401-6844-4fb0-ab2e-4a16b9740ecd','1cde9063-a5a7-4d64-9ed4-a5403f3a570d','2026-06',533,64,0.1200750469043152,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-07-01 11:14:59.476888+00'),
('efb1678d-41af-42fa-aa3b-35fb44fb2afd','668cebda-3085-4052-a45e-1205cf0849a0','2026-06',180,7,0.03888888888888889,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-07-01 11:14:59.476888+00'),
('74a17518-d279-429a-9e37-d036192207dd','863ed4dd-0410-46d2-acaf-29ab7c9b5741','2026-06',170,45,0.2647058823529412,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-07-01 11:14:59.476888+00'),
('2eaa7b8c-14b6-4a69-a82e-1fb0b3da1eed','9886b5cd-d461-4909-831a-a5177f9ad59b','2026-06',126,29,0.23015873015873015,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-07-01 11:14:59.476888+00'),
('7c657a46-4a27-452a-ad5e-04218399df10','5679a01d-5a5d-4aa7-a087-fbe46bd3e4e8','2026-06',98,28,0.2857142857142857,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-07-01 11:14:59.476888+00'),
('661f8f5b-880c-4da1-926e-0c76ab69e12f','1b262190-ac6e-4a8c-89bf-9965d453dfd3','2026-06',153,19,0.12418300653594772,NULL,NULL,'manual',0,NULL,true,'2026-06-30 12:38:27.126419+00','2026-07-01 11:14:59.476888+00'),
('d3cf407e-6cd9-40d1-9435-5d55d8fedf4b','5e22b250-4da4-4d05-9410-16bd8bb192e9','2026-06',154,3,0.01948051948051948,'Risco de Churn',NULL,'auto',0,'[{"count": 154, "title": "Leads"}, {"count": 3, "title": "Agendados"}, {"count": 0, "title": "Não Agendados"}, {"count": 0, "title": "Reagendados"}, {"count": 3, "title": "Cancelados"}, {"count": 2, "title": "Faltosos"}, {"count": 0, "title": "Orçamento em Aberto"}, {"count": 2, "title": "Compareceram e Não Fecharam"}, {"count": 0, "title": "Compareceram e Fecharam"}]',true,'2026-07-01 11:15:02.056095+00','2026-07-01 11:15:02.056095+00')
on conflict (clinic_id, year_month) do nothing;
