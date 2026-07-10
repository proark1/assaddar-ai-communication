set search_path = public, extensions;

-- Human takeover ("operator reply") support.
--
-- A conversation can be handed from the AI to a human agent. While ai_paused is
-- true the answer engine stays silent for that conversation and only an operator
-- reply is delivered to the customer. assigned_user_id records which teammate
-- currently owns it -- a real users FK, unlike handoff_requests.assigned_to which
-- is advisory free text. first_human_response_at stamps the first human turn so
-- first-response time can be measured. Both user references use ON DELETE SET
-- NULL so removing a user never blocks and never deletes conversation history.
alter table conversations
  add column if not exists ai_paused boolean not null default false,
  add column if not exists assigned_user_id uuid references users (id) on delete set null,
  add column if not exists first_human_response_at timestamptz;

-- Attribute an outbound message to the operator who sent it. AI ("assistant")
-- and "system" messages leave this null; only human ("operator") turns set it.
alter table messages
  add column if not exists author_user_id uuid references users (id) on delete set null;

-- The website widget polls for operator turns it has not yet shown the visitor.
-- Partial index over exactly that access path: operator messages in one
-- conversation, ordered by time.
create index if not exists messages_conversation_operator_idx
  on messages (conversation_id, created_at)
  where role = 'operator';
