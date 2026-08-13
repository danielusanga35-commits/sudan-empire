create extension if not exists pgcrypto;

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null,
  price_kobo bigint not null,
  image_url text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists adverts (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  email text not null,
  whatsapp text not null,
  business_link text,
  description text,
  image_url text,
  video_url text,
  package_code text not null check (package_code in ('week','month','quarter')),
  amount_kobo bigint not null,
  payment_reference text unique,
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  status text not null default 'pending' check (status in ('pending','active','rejected','expired')),
  featured boolean not null default false,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  rating int not null check (rating between 1 and 5),
  review_text text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  email text,
  phone text not null,
  address text,
  state text,
  total_kobo bigint not null,
  payment_reference text unique,
  payment_status text not null default 'pending',
  status text not null default 'pending',
  items jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adverts_status_idx on adverts(status);
create index if not exists adverts_expiry_idx on adverts(expires_at);
create index if not exists orders_created_idx on orders(created_at desc);
