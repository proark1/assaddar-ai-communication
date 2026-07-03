alter table users add column if not exists auth_user_id uuid;

create unique index if not exists users_auth_user_id_idx
  on users(auth_user_id)
  where auth_user_id is not null;
