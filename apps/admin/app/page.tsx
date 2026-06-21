"use client";

import {
  Bot,
  Building2,
  CheckCircle2,
  Copy,
  Database,
  KeyRound,
  MessageSquare,
  Plus,
  RefreshCw,
  Send
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Tenant = {
  id: string;
  publicId: string;
  name: string;
  slug: string;
  status?: string;
};

type KnowledgeItem = {
  id: string;
  title?: string;
  content: string;
  tags: string[];
  status: string;
};

type TestAnswer = {
  status: string;
  text: string;
  intent: string;
  confidence: number;
  handoffRecommended: boolean;
};

const defaultApiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function DashboardPage() {
  const [apiBase, setApiBase] = useState(defaultApiBase);
  const [adminToken, setAdminToken] = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testAnswer, setTestAnswer] = useState<TestAnswer | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0],
    [selectedTenantId, tenants]
  );

  const embedSnippet = selectedTenant
    ? `<script src="https://chat.example.com/widget.js" data-assistant-id="${selectedTenant.publicId}" async></script>`
    : "";

  useEffect(() => {
    const savedToken = window.localStorage.getItem("assaddar_admin_token");
    if (savedToken) {
      setAdminToken(savedToken);
    }
  }, []);

  useEffect(() => {
    if (adminToken) {
      window.localStorage.setItem("assaddar_admin_token", adminToken);
    }
  }, [adminToken]);

  async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-admin-token": adminToken,
        ...(init?.headers ?? {})
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || response.statusText);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async function refreshTenants() {
    if (!adminToken) {
      setStatus("Admin token required");
      return;
    }

    setBusy(true);
    try {
      const nextTenants = await apiFetch<Tenant[]>("/admin/tenants");
      setTenants(nextTenants);
      if (!selectedTenantId && nextTenants[0]) {
        setSelectedTenantId(nextTenants[0].id);
      }
      setStatus("Tenants loaded");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load tenants");
    } finally {
      setBusy(false);
    }
  }

  async function refreshKnowledge(tenantId = selectedTenant?.id) {
    if (!tenantId) {
      setKnowledge([]);
      return;
    }

    try {
      const items = await apiFetch<KnowledgeItem[]>(`/admin/tenants/${tenantId}/knowledge`);
      setKnowledge(items);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load knowledge");
    }
  }

  async function createTenant(event: FormEvent) {
    event.preventDefault();
    if (!tenantName || !tenantSlug) {
      return;
    }

    setBusy(true);
    try {
      const tenant = await apiFetch<Tenant>("/admin/tenants", {
        method: "POST",
        body: JSON.stringify({
          name: tenantName,
          slug: tenantSlug
        })
      });
      setTenants((current) => [tenant, ...current]);
      setSelectedTenantId(tenant.id);
      setTenantName("");
      setTenantSlug("");
      setStatus("Tenant created");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Tenant creation failed");
    } finally {
      setBusy(false);
    }
  }

  async function addFaq(event: FormEvent) {
    event.preventDefault();
    if (!selectedTenant || !question || !answer) {
      return;
    }

    setBusy(true);
    try {
      await apiFetch(`/admin/tenants/${selectedTenant.id}/knowledge/faqs`, {
        method: "POST",
        body: JSON.stringify({ question, answer, tags: ["faq"] })
      });
      setQuestion("");
      setAnswer("");
      await refreshKnowledge(selectedTenant.id);
      setStatus("Knowledge saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Knowledge save failed");
    } finally {
      setBusy(false);
    }
  }

  async function testAssistant(event: FormEvent) {
    event.preventDefault();
    if (!selectedTenant || !testMessage) {
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<{ answer: TestAnswer }>(
        `/admin/tenants/${selectedTenant.id}/test-assistant`,
        {
          method: "POST",
          body: JSON.stringify({ message: testMessage })
        }
      );
      setTestAnswer(result.answer);
      setStatus("Assistant tested");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Assistant test failed");
    } finally {
      setBusy(false);
    }
  }

  function copyEmbed() {
    if (embedSnippet) {
      navigator.clipboard.writeText(embedSnippet);
      setStatus("Embed copied");
    }
  }

  useEffect(() => {
    if (selectedTenant?.id) {
      refreshKnowledge(selectedTenant.id);
    }
  }, [selectedTenant?.id]);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Bot size={22} />
          <div>
            <strong>Assaddar AI</strong>
            <span>Communication</span>
          </div>
        </div>

        <label className="field">
          <span>API base</span>
          <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} />
        </label>

        <label className="field">
          <span>Admin token</span>
          <div className="inputIcon">
            <KeyRound size={16} />
            <input
              type="password"
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
            />
          </div>
        </label>

        <button className="primaryButton" disabled={busy} onClick={refreshTenants}>
          <RefreshCw size={16} />
          Refresh
        </button>

        <div className="tenantList">
          {tenants.map((tenant) => (
            <button
              className={tenant.id === selectedTenant?.id ? "tenantButton active" : "tenantButton"}
              key={tenant.id}
              onClick={() => setSelectedTenantId(tenant.id)}
            >
              <Building2 size={16} />
              <span>{tenant.name}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{selectedTenant?.name ?? "Tenant Operations"}</h1>
            <p>{selectedTenant?.publicId ?? "Create or select a tenant"}</p>
          </div>
          <span className="status">
            <CheckCircle2 size={16} />
            {status || "Idle"}
          </span>
        </header>

        <div className="grid">
          <section className="panel">
            <div className="panelTitle">
              <Building2 size={18} />
              <h2>Create tenant</h2>
            </div>
            <form className="form" onSubmit={createTenant}>
              <label className="field">
                <span>Name</span>
                <input value={tenantName} onChange={(event) => setTenantName(event.target.value)} />
              </label>
              <label className="field">
                <span>Slug</span>
                <input value={tenantSlug} onChange={(event) => setTenantSlug(event.target.value)} />
              </label>
              <button className="primaryButton" disabled={busy || !adminToken}>
                <Plus size={16} />
                Create
              </button>
            </form>
          </section>

          <section className="panel wide">
            <div className="panelTitle">
              <Database size={18} />
              <h2>Approved knowledge</h2>
            </div>
            <form className="form twoColumn" onSubmit={addFaq}>
              <label className="field">
                <span>Question</span>
                <input value={question} onChange={(event) => setQuestion(event.target.value)} />
              </label>
              <label className="field">
                <span>Answer</span>
                <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={4} />
              </label>
              <button className="primaryButton" disabled={busy || !selectedTenant}>
                <Plus size={16} />
                Add FAQ
              </button>
            </form>
            <div className="knowledgeList">
              {knowledge.map((item) => (
                <article className="knowledgeItem" key={item.id}>
                  <strong>{item.title ?? "Knowledge item"}</strong>
                  <p>{item.content}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel wide">
            <div className="panelTitle">
              <MessageSquare size={18} />
              <h2>Test assistant</h2>
            </div>
            <form className="testRow" onSubmit={testAssistant}>
              <input
                value={testMessage}
                onChange={(event) => setTestMessage(event.target.value)}
                placeholder="Ask from approved knowledge"
              />
              <button className="iconButton" disabled={busy || !selectedTenant} aria-label="Send test">
                <Send size={18} />
              </button>
            </form>
            {testAnswer ? (
              <div className="answerBox">
                <span>{testAnswer.status}</span>
                <p>{testAnswer.text}</p>
                <small>
                  {testAnswer.intent} · {Math.round(testAnswer.confidence * 100)}%
                </small>
              </div>
            ) : null}
          </section>

          <section className="panel">
            <div className="panelTitle">
              <Copy size={18} />
              <h2>Embed</h2>
            </div>
            <pre className="snippet">{embedSnippet || "No tenant selected"}</pre>
            <button className="primaryButton" disabled={!embedSnippet} onClick={copyEmbed}>
              <Copy size={16} />
              Copy
            </button>
          </section>
        </div>
      </section>
    </main>
  );
}
