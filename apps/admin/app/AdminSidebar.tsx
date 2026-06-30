"use client";

import {
  AlertCircle,
  Bot,
  Building2,
  CheckCircle2,
  ExternalLink,
  Globe2,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { FormEvent } from "react";
import { APP_CONFIG } from "./config";
import type { AdminSession, Tenant } from "./page-types";

type AdminSidebarProps = {
  adminSession: AdminSession | null;
  adminToken: string;
  apiBase: string;
  busy: boolean;
  selectedTenant: Tenant | undefined;
  showAdvancedConnection: boolean;
  tenantName: string;
  tenantSlug: string;
  tenants: Tenant[];
  onAdminTokenChange: (value: string) => void;
  onApiBaseChange: (value: string) => void;
  onCreateTenant: (event: FormEvent) => void;
  onLogout: () => void;
  onRefreshTenants: () => void;
  onSelectTenant: (tenantId: string) => void;
  onShowAdvancedConnectionChange: (value: boolean) => void;
  onTenantNameChange: (value: string) => void;
  onTenantSlugChange: (value: string) => void;
  onCloseSidebar: () => void;
};

export function AdminSidebar({
  adminSession,
  adminToken,
  apiBase,
  busy,
  selectedTenant,
  showAdvancedConnection,
  tenantName,
  tenantSlug,
  tenants,
  onAdminTokenChange,
  onApiBaseChange,
  onCreateTenant,
  onLogout,
  onRefreshTenants,
  onSelectTenant,
  onShowAdvancedConnectionChange,
  onTenantNameChange,
  onTenantSlugChange,
  onCloseSidebar,
}: AdminSidebarProps) {
  const hasConnection = tenants.length > 0;
  const canConnect = Boolean(adminToken || adminSession);

  return (
    <aside className="sidebar" id="primary-sidebar">
      <div className="brand">
        <span className="brandMark">
          <Bot size={20} />
        </span>
        <div>
          <strong>{APP_CONFIG.brand.name}</strong>
          <span>Communication Admin</span>
        </div>
        <button
          type="button"
          className="iconButton neutral sidebarClose"
          aria-label="Close navigation"
          onClick={onCloseSidebar}
        >
          <X size={18} />
        </button>
      </div>

      <details className="connectionDetails" open={!hasConnection}>
        <summary>
          <Globe2 size={16} />
          <span>Connection</span>
          <span
            className="connectionDot"
            data-state={hasConnection ? "connected" : "idle"}
          />
        </summary>

        <div className="sidebarSection">
          <label className="field">
            <span>Bootstrap token</span>
            <div className="inputIcon">
              <KeyRound size={16} />
              <input
                type="password"
                value={adminToken}
                onChange={(event) => onAdminTokenChange(event.target.value)}
                autoComplete="off"
              />
            </div>
          </label>

          <button
            className="textToggle"
            type="button"
            onClick={() =>
              onShowAdvancedConnectionChange(!showAdvancedConnection)
            }
          >
            {showAdvancedConnection ? "Hide advanced" : "Advanced"}
          </button>

          {showAdvancedConnection ? (
            <label className="field">
              <span>API base</span>
              <input
                value={apiBase}
                onChange={(event) => onApiBaseChange(event.target.value)}
              />
            </label>
          ) : null}

          <div
            className="connectionState"
            data-state={hasConnection ? "connected" : "idle"}
          >
            {hasConnection ? (
              <CheckCircle2 size={15} />
            ) : (
              <AlertCircle size={15} />
            )}
            <span>
              {hasConnection
                ? `${tenants.length} tenants loaded`
                : "Not connected"}
            </span>
          </div>

          <button
            className="primaryButton full"
            disabled={busy || !canConnect}
            type="button"
            onClick={onRefreshTenants}
          >
            {busy ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
            {hasConnection ? "Refresh tenants" : "Connect"}
          </button>
          {adminSession ? (
            <button
              className="secondaryButton full"
              disabled={busy}
              type="button"
              onClick={onLogout}
            >
              <X size={16} />
              Logout
            </button>
          ) : null}

          <a className="sidebarProductLink" href="/landing">
            <ExternalLink size={15} />
            Product page
          </a>
        </div>
      </details>

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
                className={
                  tenant.id === selectedTenant?.id
                    ? "tenantButton active"
                    : "tenantButton"
                }
                key={tenant.id}
                onClick={() => onSelectTenant(tenant.id)}
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
        <form className="form" onSubmit={onCreateTenant}>
          <label className="field">
            <span>Name</span>
            <input
              value={tenantName}
              onChange={(event) => onTenantNameChange(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Slug</span>
            <input
              value={tenantSlug}
              onChange={(event) => onTenantSlugChange(event.target.value)}
            />
          </label>
          <button className="secondaryButton" disabled={busy || !canConnect}>
            <Plus size={16} />
            Create tenant
          </button>
        </form>
      </details>
    </aside>
  );
}
