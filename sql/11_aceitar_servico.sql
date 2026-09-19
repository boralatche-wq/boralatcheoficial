-- =========================================================================
-- ACEITAR SERVIÇO — pendente deixa de bloquear o horário
--
-- Antes: qualquer agendamento (mesmo "pendente") já tirava aquele horário
-- da lista de disponíveis, então só o primeiro cliente a marcar conseguia.
--
-- Agora: um agendamento "pendente" é só um PEDIDO — não ocupa o horário de
-- verdade ainda. Vários clientes podem pedir o mesmo horário. O horário só
-- fica indisponível pra outros quando o PRESTADOR aceita um deles
-- (status vira 'confirmado'). Isso possibilita a tela de "Solicitações
-- pendentes" em matches.html, onde o prestador escolhe qual pedido aceitar
-- (ordenando por preço, duração etc) quando há mais de um interessado.
-- =========================================================================

create or replace function slots_disponiveis(
  p_prestador_id  uuid,
  p_data          date,
  p_duracao_min   int,
  p_intervalo_min int default 20
) returns table (horario time)
language plpgsql stable security definer set search_path = public as $$
declare
  v_dia_semana   int := extract(dow from p_data);
  v_config       horarios_atendimento%rowtype;
  v_candidato    time;
  v_fim_candidato time;
begin
  if p_data < current_date then
    return;
  end if;

  select * into v_config
    from horarios_atendimento
   where prestador_id = p_prestador_id
     and dia_semana = v_dia_semana
   limit 1;

  if not found then
    return;
  end if;

  v_candidato := v_config.horario_inicio;

  while v_candidato + make_interval(mins => p_duracao_min) <= v_config.horario_fim loop
    v_fim_candidato := v_candidato + make_interval(mins => p_duracao_min);

    if p_data = current_date and v_candidato <= current_time then
      v_candidato := v_candidato + make_interval(mins => p_intervalo_min);
      continue;
    end if;

    if v_config.intervalo_inicio is not null
       and v_candidato < v_config.intervalo_fim
       and v_fim_candidato > v_config.intervalo_inicio
    then
      v_candidato := v_candidato + make_interval(mins => p_intervalo_min);
      continue;
    end if;

    -- só CONFIRMADO (ou em andamento/concluído) bloqueia o horário —
    -- pendente é só um pedido, não ocupa o horário ainda.
    if not exists (
      select 1
        from agendamentos ag
        join servicos_prestador sp on sp.id = ag.servico_id
       where ag.prestador_id = p_prestador_id
         and ag.data = p_data
         and ag.status in ('confirmado', 'em_andamento', 'concluido')
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
-- ACEITAR UM PEDIDO — confirma o escolhido e recusa automaticamente
-- qualquer outro pedido PENDENTE do mesmo prestador que colida no horário
-- (dois pedidos pro mesmo horário não podem os dois virar confirmado).
--
-- Roda como quem chamou (sem security definer) — a RLS de `agendamentos`
-- já garante sozinha que só o prestador dono pode mexer nessas linhas,
-- então isso é só uma forma atômica (uma chamada só) de fazer as duas
-- atualizações, em vez do front-end fazer em duas etapas com risco de
-- corrida entre uma chamada e outra.
-- -------------------------------------------------------------------------

create or replace function aceitar_agendamento(p_agendamento_id uuid)
returns void
language plpgsql as $$
declare
  v_ag agendamentos%rowtype;
begin
  select * into v_ag from agendamentos where id = p_agendamento_id;

  if not found then
    raise exception 'Agendamento não encontrado ou sem permissão de acesso';
  end if;

  if v_ag.prestador_id <> auth.uid() then
    raise exception 'Você não pode aceitar esse agendamento';
  end if;

  if v_ag.status <> 'pendente' then
    raise exception 'Esse pedido não está mais pendente';
  end if;

  update agendamentos
     set status = 'confirmado'
   where id = p_agendamento_id;

  -- recusa qualquer outro pedido pendente do mesmo prestador que
  -- sobreponha esse horário nesse dia
  update agendamentos
     set status = 'cancelado'
   where prestador_id = v_ag.prestador_id
     and data = v_ag.data
     and status = 'pendente'
     and id <> p_agendamento_id
     and hora_inicio < v_ag.hora_fim
     and hora_fim > v_ag.hora_inicio;
end;
$$;

grant execute on function aceitar_agendamento(uuid) to authenticated;
