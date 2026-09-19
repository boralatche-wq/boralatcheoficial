-- =========================================================================
-- SEED — categorias e tipos de serviço de exemplo
-- Ajuste/expanda conforme os serviços reais da plataforma.
-- =========================================================================

insert into categorias (nome, slug, icone) values
  ('Cabelo',        'cabelo',        '💇'),
  ('Unhas',         'unhas',         '💅'),
  ('Estética Facial','estetica-facial','✨'),
  ('Maquiagem',     'maquiagem',     '💄'),
  ('Massagem',      'massagem',      '💆'),
  ('Sobrancelha',   'sobrancelha',   '👁️')
on conflict (slug) do nothing;

insert into tipos_servico (categoria_id, nome, slug)
select c.id, t.nome, t.slug from categorias c
join (values
  ('cabelo', 'Corte', 'corte'),
  ('cabelo', 'Coloração', 'coloracao'),
  ('cabelo', 'Escova', 'escova'),
  ('unhas', 'Manicure', 'manicure'),
  ('unhas', 'Pedicure', 'pedicure'),
  ('unhas', 'Unha em gel', 'unha-gel'),
  ('estetica-facial', 'Limpeza de pele', 'limpeza-pele'),
  ('estetica-facial', 'Peeling', 'peeling'),
  ('maquiagem', 'Maquiagem social', 'maquiagem-social'),
  ('maquiagem', 'Maquiagem noiva', 'maquiagem-noiva'),
  ('massagem', 'Relaxante', 'relaxante'),
  ('massagem', 'Modeladora', 'modeladora'),
  ('sobrancelha', 'Design com henna', 'design-henna'),
  ('sobrancelha', 'Micropigmentação', 'micropigmentacao')
) as t(categoria_slug, nome, slug) on t.categoria_slug = c.slug
on conflict (categoria_id, slug) do nothing;

insert into catalogo (tipo_servico_id, produto, slug)
select ts.id, p.produto, p.slug from tipos_servico ts
join (values
  ('corte', 'Corte feminino', 'corte-feminino'),
  ('corte', 'Corte masculino', 'corte-masculino'),
  ('coloracao', 'Coloração completa', 'coloracao-completa'),
  ('coloracao', 'Mechas / Luzes', 'mechas-luzes'),
  ('manicure', 'Manicure tradicional', 'manicure-tradicional'),
  ('unha-gel', 'Alongamento em gel', 'alongamento-gel'),
  ('limpeza-pele', 'Limpeza de pele profunda', 'limpeza-pele-profunda'),
  ('maquiagem-social', 'Maquiagem para festa', 'maquiagem-festa'),
  ('relaxante', 'Massagem relaxante 60min', 'massagem-relaxante-60'),
  ('design-henna', 'Design de sobrancelha com henna', 'design-henna-completo')
) as p(tipo_slug, produto, slug) on p.tipo_slug = ts.slug
on conflict do nothing;
