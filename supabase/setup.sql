-- Mandi app: database setup.
--
-- Paste this whole file into Supabase -> SQL Editor -> New query, and press Run.
-- It is safe to run again: it only adds what is missing and replaces functions.
--
-- One business per login. Every row carries owner_id, which defaults to the
-- signed-in user, and row-level security lets each login see and change only
-- its own rows. Staff of one business share that business's login.
--
-- References between tables include owner_id (a composite foreign key), so a
-- sale can only ever point at a challan of the same business.

-- ------------------------------------------------------------- settings --

create table if not exists public.settings (
  owner_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  business_name text not null default 'My Mandi' check (btrim(business_name) <> ''),
  -- Money in hand and in the bank when the business started using the app.
  opening_cash  numeric(14, 2) not null default 0,
  opening_bank  numeric(14, 2) not null default 0,
  updated_at    timestamptz not null default now()
);

-- -------------------------------------------------- customers, suppliers --

create table if not exists public.customers (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (btrim(name) <> ''),
  phone           text,
  notes           text,
  -- What they already owed you before the app. Negative: an advance they had paid.
  opening_balance numeric(14, 2) not null default 0,
  created_at      timestamptz not null default now(),
  unique (id, owner_id)
);
create unique index if not exists customers_name_idx on public.customers (owner_id, lower(btrim(name)));

create table if not exists public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (btrim(name) <> ''),
  phone           text,
  notes           text,
  -- What you already owed them before the app. Negative: an advance you had paid.
  opening_balance numeric(14, 2) not null default 0,
  created_at      timestamptz not null default now(),
  unique (id, owner_id)
);
create unique index if not exists suppliers_name_idx on public.suppliers (owner_id, lower(btrim(name)));

-- ------------------------------------------------------------- challans --

-- One bulk purchase of animals. Whatever is not paid now goes on the
-- supplier's ledger.
create table if not exists public.challans (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number      integer not null check (number > 0),
  bought_on   date not null,
  supplier_id uuid not null,
  paid_now    numeric(14, 2) not null default 0 check (paid_now >= 0),
  paid_from   text not null default 'cash' check (paid_from in ('cash', 'bank')),
  notes       text,
  created_at  timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, number),
  foreign key (supplier_id, owner_id) references public.suppliers (id, owner_id)
);

-- One kind of animal on a challan: how many, and what they cost together.
-- Animals are counted, not tracked one by one; each costs the line's average.
create table if not exists public.challan_lines (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  challan_id uuid not null,
  animal     text not null check (btrim(animal) <> ''),
  head       integer not null check (head > 0),
  cost       numeric(14, 2) not null check (cost >= 0),
  position   smallint not null default 0,
  unique (id, owner_id),
  foreign key (challan_id, owner_id) references public.challans (id, owner_id) on delete cascade
);
create unique index if not exists challan_lines_animal_idx on public.challan_lines (challan_id, lower(btrim(animal)));

-- ---------------------------------------------------------------- sales --

-- customer_id is null for a walk-in customer, who must pay in full.
create table if not exists public.sales (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number       integer not null check (number > 0),
  sold_on      date not null,
  customer_id  uuid,
  received_now numeric(14, 2) not null default 0 check (received_now >= 0),
  received_in  text not null default 'cash' check (received_in in ('cash', 'bank')),
  notes        text,
  created_at   timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, number),
  foreign key (customer_id, owner_id) references public.customers (id, owner_id)
);

create table if not exists public.sale_lines (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sale_id         uuid not null,
  challan_line_id uuid not null,
  head            integer not null check (head > 0),
  amount          numeric(14, 2) not null check (amount >= 0),
  -- Sold cheap because the animal was injured or sick.
  damaged         boolean not null default false,
  position        smallint not null default 0,
  foreign key (sale_id, owner_id) references public.sales (id, owner_id) on delete cascade,
  foreign key (challan_line_id, owner_id) references public.challan_lines (id, owner_id)
);
create index if not exists sale_lines_sale_idx on public.sale_lines (sale_id);
create index if not exists sale_lines_line_idx on public.sale_lines (challan_line_id);

-- --------------------------------------------------------------- deaths --

create table if not exists public.deaths (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  died_on         date not null,
  challan_line_id uuid not null,
  head            integer not null check (head > 0),
  cause           text,
  created_at      timestamptz not null default now(),
  foreign key (challan_line_id, owner_id) references public.challan_lines (id, owner_id)
);
create index if not exists deaths_line_idx on public.deaths (challan_line_id);

-- ------------------------------------------------------------- payments --

-- Money that moves on its own: a later payment from a customer or to a
-- supplier, cash put in or taken out of the bank, or the owner's own money.
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  paid_on     date not null,
  kind        text not null check (kind in (
                'from_customer', 'to_supplier', 'cash_to_bank', 'bank_to_cash', 'owner_in', 'owner_out')),
  customer_id uuid,
  supplier_id uuid,
  account     text check (account in ('cash', 'bank')),
  amount      numeric(14, 2) not null check (amount > 0),
  notes       text,
  created_at  timestamptz not null default now(),
  -- Each kind carries exactly the fields it uses. A transfer has no account:
  -- it always runs between the two.
  constraint payments_fields check (case kind
    when 'from_customer' then customer_id is not null and supplier_id is null and account is not null
    when 'to_supplier' then supplier_id is not null and customer_id is null and account is not null
    when 'owner_in' then customer_id is null and supplier_id is null and account is not null
    when 'owner_out' then customer_id is null and supplier_id is null and account is not null
    else customer_id is null and supplier_id is null and account is null
  end),
  foreign key (customer_id, owner_id) references public.customers (id, owner_id),
  foreign key (supplier_id, owner_id) references public.suppliers (id, owner_id)
);

-- ------------------------------------------------------------- expenses --

-- challan_id is set when the cost belongs to one challan (its transport,
-- fodder and the like); it then comes off that challan's profit.
create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  spent_on   date not null,
  category   text not null check (btrim(category) <> ''),
  amount     numeric(14, 2) not null check (amount > 0),
  paid_from  text not null check (paid_from in ('cash', 'bank')),
  challan_id uuid,
  notes      text,
  created_at timestamptz not null default now(),
  foreign key (challan_id, owner_id) references public.challans (id, owner_id)
);
create index if not exists expenses_challan_idx on public.expenses (challan_id);

-- ------------------------------------------------- row-level security --

-- Every policy is the same sentence: this row is mine.
do $$
declare
  t text;
begin
  foreach t in array array[
    'settings', 'customers', 'suppliers', 'challans', 'challan_lines',
    'sales', 'sale_lines', 'deaths', 'payments', 'expenses'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',
      t
    );
    execute format('create index if not exists %I on public.%I (owner_id)', t || '_owner_idx', t);
  end loop;
end $$;

-- Supabase usually grants these by default. Granted outright as well, so a
-- project set up without those defaults still works; the policies above
-- decide which rows each login reaches.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.settings, public.customers, public.suppliers, public.challans, public.challan_lines,
  public.sales, public.sale_lines, public.deaths, public.payments, public.expenses
  to authenticated;

-- ------------------------------------------------------- animal stock --

-- No line may have more animals sold or dead than were bought. Checked after
-- every sale line, death, or change to a line's count. The line is locked
-- first, so two phones selling the last goat at once cannot both succeed.
create or replace function public.check_line_stock(p_line uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_head   integer;
  v_animal text;
  v_number integer;
  v_used   integer;
begin
  select cl.head, cl.animal, c.number
    into v_head, v_animal, v_number
    from public.challan_lines cl
    join public.challans c on c.id = cl.challan_id
   where cl.id = p_line
     for update of cl;
  if not found then
    return;
  end if;

  select coalesce((select sum(head) from public.sale_lines where challan_line_id = p_line), 0)
       + coalesce((select sum(head) from public.deaths where challan_line_id = p_line), 0)
    into v_used;

  if v_used > v_head then
    raise exception 'Challan #% has % % in all; this would make % sold or dead.', v_number, v_head, v_animal, v_used
      using errcode = 'P0001';
  end if;
end $$;

create or replace function public.trg_check_stock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'challan_lines' then
    perform public.check_line_stock(new.id);
  else
    perform public.check_line_stock(new.challan_line_id);
  end if;
  return null;
end $$;

drop trigger if exists sale_lines_stock on public.sale_lines;
create trigger sale_lines_stock
  after insert or update on public.sale_lines
  for each row execute function public.trg_check_stock();

drop trigger if exists deaths_stock on public.deaths;
create trigger deaths_stock
  after insert or update on public.deaths
  for each row execute function public.trg_check_stock();

drop trigger if exists challan_lines_stock on public.challan_lines;
create trigger challan_lines_stock
  after update of head on public.challan_lines
  for each row execute function public.trg_check_stock();

-- --------------------------------------------------------- save_challan --

-- Saves a challan and its lines together, or nothing. A new challan takes the
-- next number. Lines left out of p_lines are removed, which the database
-- refuses if they already have sales or deaths.
create or replace function public.save_challan(p_challan jsonb, p_lines jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_owner  uuid := auth.uid();
  v_id     uuid := coalesce((p_challan ->> 'id')::uuid, gen_random_uuid());
  v_paid   numeric := coalesce((p_challan ->> 'paid_now')::numeric, 0);
  v_number integer;
  v_total  numeric;
  v_ids    uuid[];
begin
  if v_owner is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one kind of animal.' using errcode = 'P0001';
  end if;

  select coalesce(sum((l ->> 'cost')::numeric), 0) into v_total from jsonb_array_elements(p_lines) l;
  if v_paid > v_total + 0.005 then
    raise exception 'Paid now is more than the challan total.' using errcode = 'P0001';
  end if;

  -- One new number at a time per business.
  perform pg_advisory_xact_lock(hashtext('challan:' || v_owner::text));
  select number into v_number from public.challans where id = v_id;
  if v_number is null then
    select coalesce(max(number), 0) + 1 into v_number from public.challans where owner_id = v_owner;
  end if;

  insert into public.challans (id, number, bought_on, supplier_id, paid_now, paid_from, notes)
  values (
    v_id,
    v_number,
    (p_challan ->> 'bought_on')::date,
    (p_challan ->> 'supplier_id')::uuid,
    v_paid,
    coalesce(p_challan ->> 'paid_from', 'cash'),
    nullif(btrim(p_challan ->> 'notes'), '')
  )
  on conflict (id) do update
    set bought_on   = excluded.bought_on,
        supplier_id = excluded.supplier_id,
        paid_now    = excluded.paid_now,
        paid_from   = excluded.paid_from,
        notes       = excluded.notes;

  select array_agg((l ->> 'id')::uuid) into v_ids
    from jsonb_array_elements(p_lines) l
   where l ? 'id';

  delete from public.challan_lines
   where challan_id = v_id
     and id <> all (coalesce(v_ids, '{}'::uuid[]));

  insert into public.challan_lines as cl (id, challan_id, animal, head, cost, position)
  select coalesce((l ->> 'id')::uuid, gen_random_uuid()),
         v_id,
         btrim(l ->> 'animal'),
         (l ->> 'head')::integer,
         (l ->> 'cost')::numeric,
         (n - 1)::smallint
    from jsonb_array_elements(p_lines) with ordinality as x (l, n)
  on conflict (id) do update
    set animal   = excluded.animal,
        head     = excluded.head,
        cost     = excluded.cost,
        position = excluded.position
    where cl.challan_id = excluded.challan_id;

  return jsonb_build_object('id', v_id, 'number', v_number);
end $$;

-- ------------------------------------------------------------ save_sale --

-- Saves a sale and its lines together, or nothing. A new sale takes the next
-- number. The stock trigger refuses more animals than a challan has left.
create or replace function public.save_sale(p_sale jsonb, p_lines jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_owner    uuid := auth.uid();
  v_id       uuid := coalesce((p_sale ->> 'id')::uuid, gen_random_uuid());
  v_customer uuid := nullif(p_sale ->> 'customer_id', '')::uuid;
  v_received numeric := coalesce((p_sale ->> 'received_now')::numeric, 0);
  v_number   integer;
  v_total    numeric;
begin
  if v_owner is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one animal.' using errcode = 'P0001';
  end if;

  select coalesce(sum((l ->> 'amount')::numeric), 0) into v_total from jsonb_array_elements(p_lines) l;
  if v_received > v_total + 0.005 then
    raise exception 'Received now is more than the sale total.' using errcode = 'P0001';
  end if;
  if v_customer is null and abs(v_received - v_total) >= 0.005 then
    raise exception 'A walk-in customer must pay in full. Pick a customer to sell on credit.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('sale:' || v_owner::text));
  select number into v_number from public.sales where id = v_id;
  if v_number is null then
    select coalesce(max(number), 0) + 1 into v_number from public.sales where owner_id = v_owner;
  end if;

  insert into public.sales (id, number, sold_on, customer_id, received_now, received_in, notes)
  values (
    v_id,
    v_number,
    (p_sale ->> 'sold_on')::date,
    v_customer,
    v_received,
    coalesce(p_sale ->> 'received_in', 'cash'),
    nullif(btrim(p_sale ->> 'notes'), '')
  )
  on conflict (id) do update
    set sold_on      = excluded.sold_on,
        customer_id  = excluded.customer_id,
        received_now = excluded.received_now,
        received_in  = excluded.received_in,
        notes        = excluded.notes;

  -- Replaced whole: nothing points at a sale line.
  delete from public.sale_lines where sale_id = v_id;

  insert into public.sale_lines (id, sale_id, challan_line_id, head, amount, damaged, position)
  select coalesce((l ->> 'id')::uuid, gen_random_uuid()),
         v_id,
         (l ->> 'challan_line_id')::uuid,
         (l ->> 'head')::integer,
         (l ->> 'amount')::numeric,
         coalesce((l ->> 'damaged')::boolean, false),
         (n - 1)::smallint
    from jsonb_array_elements(p_lines) with ordinality as x (l, n);

  return jsonb_build_object('id', v_id, 'number', v_number);
end $$;

grant execute on function public.check_line_stock(uuid) to authenticated;
revoke all on function public.save_challan(jsonb, jsonb) from public, anon;
revoke all on function public.save_sale(jsonb, jsonb) from public, anon;
grant execute on function public.save_challan(jsonb, jsonb) to authenticated;
grant execute on function public.save_sale(jsonb, jsonb) to authenticated;
