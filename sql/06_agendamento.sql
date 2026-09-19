-- =========================================================================
-- AUTOMAÇÃO DA AGENDA — disponibilidade real de horários/dias
-- Antes disso só existia a VISUALIZAÇÃO da agenda (agenda.html). Isso aqui
-- é o que faltava: calcular quais horários/dias o prestador tem realmente
-- livres, considerando a duração de CADA serviço já agendado, pra nunca
-- deixar o cliente marcar em cima de outro atendimento.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) HORÁRIOS LIVRES de um prestador, num dia específico, pra um serviço
--    com uma duração X. Considera: horário de trabalho do dia da semana,
--    intervalo/pausa (se houver) e sobreposição com agendamentos já feitos
--    (usando a duração do serviço de CADA agendamento existente).
--
--    SECURITY DEFINER é necessário aqui: a policy de `agendamentos` só
--    deixa cada um ver os PRÓPRIOS agendamentos (RLS), mas pra calcular
--    disponibilidade precisamos enxergar TODOS os agendamentos do
--    prestador (de qualquer cliente) — sem isso, um cliente conseguiria
--    marcar em cima do horário de outro cliente sem o sistema perceber.
--    A função só devolve HORÁRIOS livres, nunca dados de quem agendou,
--    então a privacidade dos outros clientes continua protegida.
-- -------------------------------------------------------------------------

create or replace function slots_disponiveis(
  p_prestador_id  uuid,
  p_data          date,
  p_duracao_min   int,
  p_intervalo_min int default 20 -- granularidade dos horários oferecidos
) returns table (horario time)
language plpgsql stable security definer set search_path = public as $$
declare
  v_dia_semana   int := extract(dow from p_data);
  v_config       horarios_atendimento%rowtype;
  v_candidato    time;
  v_fim_candidato time;
begin
  -- não oferece horário no passado
  if p_data < current_date then
    return;
  end if;

  select * into v_config
    from horarios_atendimento
   where prestador_id = p_prestador_id
     and dia_semana = v_dia_semana
   limit 1;

  if not found then
    return; -- prestador não atende nesse dia da semana
  end if;

  v_candidato := v_config.horario_inicio;

  while v_candidato + make_interval(mins => p_duracao_min) <= v_config.horario_fim loop
    v_fim_candidato := v_candidato + make_interval(mins => p_duracao_min);

    -- não oferece horário que já passou, se for hoje
    if p_data = current_date and v_candidato <= current_time then
      v_candidato := v_candidato + make_interval(mins => p_intervalo_min);
      continue;
    end if;

    -- pula o intervalo de almoço/pausa, se definido e sobrepuser
    if v_config.intervalo_inicio is not null
       and v_candidato < v_config.intervalo_fim
       and v_fim_candidato > v_config.intervalo_inicio
    then
      v_candidato := v_candidato + make_interval(mins => p_intervalo_min);
      continue;
    end if;

    -- pula se sobrepuser algum agendamento já existente desse prestador
    -- (considerando a duração do SERVIÇO de cada agendamento)
    if not exists (
      select 1
        from agendamentos ag
        join servicos_prestador sp on sp.id = ag.servico_id
       where ag.prestador_id = p_prestador_id
         and ag.data = p_data
         and ag.status <> 'cancelado'
         and v_candidato < (ag.hora_inicio + make_interval(mins => sp.duracao_min))
         and v_fim_candidato > ag.hora_inicio
    ) then
      horario := v_candidato;
      return next;
    end if;

    v_candidato := v_candidato + make_interval(mins => p_intervalo_min);
  end loop;

  return;
end;
$$;

grant execute on function slots_disponiveis(uuid, date, int, int) to authenticated;

-- -------------------------------------------------------------------------
-- 2) DIAS DISPONÍVEIS de um prestador num mês (pra pintar o calendário de
--    "tem horário livre" / "sem vaga"), reaproveitando a função acima.
-- -------------------------------------------------------------------------

create or replace function dias_disponiveis_prestador(
  p_prestador_id uuid,
  p_ano          int,
  p_mes          int,
  p_duracao_min  int
) returns table (dia date, disponivel boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_primeiro date := make_date(p_ano, p_mes, 1);
  v_ultimo   date := (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date;
  v_atual    date;
  v_qtd      int;
begin
  v_atual := v_primeiro;

  while v_atual <= v_ultimo loop
    if v_atual < current_date then
      v_qtd := 0; -- dia passado nunca é disponível
    else
      select count(*) into v_qtd
        from slots_disponiveis(p_prestador_id, v_atual, p_duracao_min);
    end if;

    dia := v_atual;
    disponivel := v_qtd > 0;
    return next;

    v_atual := v_atual + 1;
  end loop;

  return;
end;
$$;

grant execute on function dias_disponiveis_prestador(uuid, int, int, int) to authenticated;
