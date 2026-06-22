"use client";

import {
  AlertCircle,
  Bot,
  Building2,
  CheckCircle2,
  Copy,
  Database,
  Globe2,
  KeyRound,
  Loader2,
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
  metadata?: {
    question?: string;
    answer?: string;
  };
};

type TestAnswer = {
  status: string;
  text: string;
  intent: string;
  confidence: number;
  handoffRecommended: boolean;
};

const productionApiBase = "https://assaddar-api-production.up.railway.app";
const defaultApiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? productionApiBase;
const defaultWidgetUrl =
  process.env.NEXT_PUBLIC_WIDGET_URL ?? "https://assaddar-widget-production.up.railway.app/widget.js";

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function statusTone(status: string) {
  if (!status) {
    return "neutral";
  }

  return /failed|required|error|unauthorized|forbidden|not found|not allowed/i.test(status)
    ? "danger"
    : "success";
}

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

  const normalizedApiBase = normalizeBaseUrl(apiBase);
  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0],
    [selectedTenantId, tenants]
  );

  const embedSnippet = selectedTenant
    ? `<script src="${defaultWidgetUrl}" data-assistant-id="${selectedTenant.publicId}" data-api-url="${normalizedApiBase}" async></script>`
    : "";

  const statusKind = statusTone(status);

  useEffect(() => {
    const savedToken = window.localStorage.getItem("assaddar_admin_token");
    const savedApiBase = window.localStorage.getItem("assaddar_api_base");

    if (savedToken) {
      setAdminToken(savedToken);
    }

    if (savedApiBase) {
      setApiBase(savedApiBase);
    }
  }, []);

  useEffect(() => {
    if (adminToken) {
      window.localStorage.setItem("assaddar_admin_token", adminToken);
    }
  }, [adminToken]);

  useEffect(() => {
    if (normalizedApiBase) {
      window.localStorage.setItem("assaddar_api_base", normalizedApiBase);
    }
  }, [normalizedApiBase]);

  async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${normalizedApiBase}${path}`, {
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
      if (nextTenants[0] && !nextTenants.some((tenant) => tenant.id === selectedTenantId)) {
        setSelectedTenantId(nextTenants[0].id);
      }
      setStatus(nextTenants.length ? "Connected" : "No tenants found");
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

  async function copyEmbed() {
    if (embedSnippet) {
      await navigator.clipboard.writeText(embedSnippet);
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
          <span className="brandMark">
            <Bot size={20} />
          </span>
          <div>
            <strong>Assaddar AI</strong>
            <span>Communication Admin</span>
          </div>
        </div>

        <section className="sidebarSection">
          <div className="sectionTitle">
            <Globe2 size={16} />
            <span>Connection</span>
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
                autoComplete="off"
              />
            </div>
          </label>

          <div className="connectionState" data-state={tenants.length ? "connected" : "idle"}>
            {tenants.length ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <span>{tenants.length ? `${tenants.length} tenants loaded` : "Not connected"}</span>
          </div>

          <button className="primaryButton full" disabled={busy || !adminToken} onClick={refreshTenants}>
            {busy ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            {tenants.length ? "Refresh tenants" : "Connect"}
          </button>
        </section>

        <section className="sidebarSection grow">
          <div className="sectionTitle">
            <Building2 size={16} />
            <span>Tenants</span>
            <span className="countPill">{tenants.length}</span>
          </div>

          <div className="tenantList">
            {tenants.length ? (
              tenants.map((tenant) => (
                <button
                  className={tenant.id === selectedTenant?.id ? "tenantButton active" : "tenantButton"}
                  key={tenant.id}
                  onClick={() => setSelectedTenantId(tenant.id)}
                >
                  <Building2 size={16} />
                  <span>{tenant.name}</span>
                  <small>{tenant.slug}</small>
                </button>
              ))
            ) : (
              <div className="emptyState compact">Connect to load tenants.</div>
            )}
          </div>
        </section>

        <details className="newTenant">
          <summary>
            <Plus size={16} />
            New tenant
          </summary>
          <form className="form" onSubmit={createTenant}>
            <label className="field">
              <span>Name</span>
              <input value={tenantName} onChange={(event) => setTenantName(event.target.value)} />
            </label>
            <label className="field">
              <span>Slug</span>
              <input value={tenantSlug} onChange={(event) => setTenantSlug(event.target.value)} />
            </label>
            <button className="secondaryButton" disabled={busy || !adminToken}>
              <Plus size={16} />
              Create tenant
            </button>
          </form>
        </details>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="titleGroup">
            <span className="eyebrow">Workspace</span>
            <h1>{selectedTenant?.name ?? "Select a tenant"}</h1>
            <p>{selectedTenant?.publicId ?? "Connect to the API and choose a tenant from the sidebar."}</p>
          </div>
          <span className="status" data-tone={statusKind}>
            {statusKind === "danger" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            {status || "Ready"}
          </span>
        </header>

        {selectedTenant ? (
          <div className="dashboardGrid">
            <section className="panel knowledgePanel">
              <div className="panelHeader">
                <div className="panelTitle">
                  <Database size={18} />
                  <h2>Approved knowledge</h2>
                </div>
                <span className="countPill">{knowledge.length}</span>
              </div>

              <form className="knowledgeForm" onSubmit={addFaq}>
                <label className="field">
                  <span>Question</span>
                  <input value={question} onChange={(event) => setQuestion(event.target.value)} />
                </label>
                <label className="field">
                  <span>Answer</span>
                  <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={4} />
                </label>
                <button className="primaryButton" disabled={busy || !question || !answer}>
                  <Plus size={16} />
                  Add FAQ
                </button>
              </form>

              <div className="knowledgeList">
                {knowledge.length ? (
                  knowledge.map((item) => (
                    <article className="knowledgeItem" key={item.id}>
                      <div>
                        <strong>{item.metadata?.question ?? item.title ?? "Knowledge item"}</strong>
                        <span>{item.status}</span>
                      </div>
                      <p>{item.metadata?.answer ?? item.content}</p>
                    </article>
                  ))
                ) : (
                  <div className="emptyState">No approved knowledge loaded for this tenant.</div>
                )}
              </div>
            </section>

            <section className="panel sidePanel">
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
                <button className="iconButton" disabled={busy || !testMessage} aria-label="Send test">
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
              ) : (
                <div className="emptyState compact">Test answers appear here.</div>
              )}
            </section>

            <section className="panel sidePanel">
              <div className="panelTitle">
                <Copy size={18} />
                <h2>Embed</h2>
              </div>
              <pre className="snippet">{embedSnippet}</pre>
              <button className="secondaryButton full" disabled={!embedSnippet} onClick={copyEmbed}>
                <Copy size={16} />
                Copy snippet
              </button>
            </section>
          </div>
        ) : (
          <section className="emptyWorkspace">
            <Bot size={28} />
            <h2>No tenant selected</h2>
            <p>Connect with the admin token, then select Assad Dar AI Consultancy from the sidebar.</p>
          </section>
        )}
      </section>
    </main>
  );
}
