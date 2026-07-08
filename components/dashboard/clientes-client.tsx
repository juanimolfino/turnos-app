"use client";

import { useMemo, useState } from "react";
import { Edit3, Plus, Save, Trash2, X } from "lucide-react";

export type PanelCustomer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  channel: string | null;
  channelUserId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  source: "bot" | "admin";
  editable: boolean;
};

type FormState = {
  name: string;
  phone: string;
  email: string;
  notes: string;
};

const emptyForm: FormState = { name: "", phone: "", email: "", notes: "" };

function toForm(customer: PanelCustomer): FormState {
  return {
    name: customer.name,
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    notes: customer.notes ?? "",
  };
}

function customerFromResponse(raw: PanelCustomer): PanelCustomer {
  return {
    ...raw,
    source: raw.channel && raw.channelUserId ? "bot" : "admin",
    editable: !(raw.channel && raw.channelUserId),
  };
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

const styles = {
  page: {
    minHeight: "100%",
    padding: "24px 28px 96px",
    color: "#221F1B",
    display: "flex",
    flexDirection: "column" as const,
    gap: 18,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap" as const,
  },
  title: { fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 34, lineHeight: 1, margin: 0 },
  subtitle: { margin: "8px 0 0", color: "#6B6660", fontSize: 14, maxWidth: 640, lineHeight: 1.45 },
  button: {
    border: "1px solid #D85F34",
    background: "#C96442",
    color: "#fff",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
  },
  ghostButton: {
    border: "1px solid #E0DACE",
    background: "#fff",
    color: "#6B6660",
    borderRadius: 10,
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    minHeight: 38,
  },
  dangerButton: {
    border: "1px solid #E2B8AA",
    background: "#FFF6F2",
    color: "#B0572C",
    borderRadius: 10,
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    minHeight: 38,
  },
  panel: { background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, overflow: "hidden" },
  form: {
    display: "grid",
    gridTemplateColumns: "minmax(180px, 1.2fr) minmax(150px, .9fr) minmax(180px, 1fr) minmax(220px, 1.4fr) auto",
    gap: 10,
    padding: 16,
    alignItems: "end",
    borderBottom: "1px solid #EFEAE0",
  },
  field: { display: "flex", flexDirection: "column" as const, gap: 6, minWidth: 0 },
  label: { fontSize: 12, fontWeight: 700, color: "#6B6660" },
  input: {
    width: "100%",
    border: "1px solid #D8D1C5",
    borderRadius: 10,
    background: "#fff",
    padding: "10px 11px",
    fontSize: 14,
    fontFamily: "inherit",
    color: "#221F1B",
    outline: "none",
  },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: {
    textAlign: "left" as const,
    fontSize: 11,
    letterSpacing: ".08em",
    textTransform: "uppercase" as const,
    color: "#A39C8F",
    padding: "13px 16px",
    borderBottom: "1px solid #EFEAE0",
    background: "#F6F1E8",
  },
  td: { padding: "14px 16px", borderBottom: "1px solid #EFEAE0", verticalAlign: "top" as const, fontSize: 14 },
};

export function ClientesClient({ initialCustomers }: { initialCustomers: PanelCustomer[] }) {
  const [customers, setCustomers] = useState<PanelCustomer[]>(initialCustomers.map(customerFromResponse));
  const [showForm, setShowForm] = useState(initialCustomers.length === 0);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const counts = useMemo(() => {
    const bot = customers.filter((customer) => customer.source === "bot").length;
    return { total: customers.length, bot, admin: customers.length - bot };
  }, [customers]);

  function updateForm(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateEditingForm(key: keyof FormState, value: string) {
    setEditingForm((current) => ({ ...current, [key]: value }));
  }

  async function createCustomer() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo crear el cliente.");
      setCustomers((current) => [customerFromResponse(body.customer), ...current]);
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCustomer(customerId: string) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editingForm),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar el cliente.");
      setCustomers((current) => current.map((customer) => customer.id === customerId ? customerFromResponse(body.customer) : customer));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCustomer(customerId: string) {
    const customer = customers.find((item) => item.id === customerId);
    if (!customer || !window.confirm(`¿Borrar a ${customer.name}? Esta acción lo quita de la lista de clientes.`)) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/customers/${customerId}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo borrar el cliente.");
      setCustomers((current) => current.filter((item) => item.id !== customerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar el cliente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Clientes</h1>
          <p style={styles.subtitle}>
            Registro de jugadores del club. Los que llegan por el bot quedan como solo lectura; los que agregás desde el panel se pueden editar o borrar.
          </p>
        </div>
        <button type="button" style={styles.button} onClick={() => setShowForm((value) => !value)}>
          {showForm ? <X size={17} /> : <Plus size={17} />}
          {showForm ? "Cerrar" : "Agregar cliente"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Badge label={`${counts.total} clientes`} />
        <Badge label={`${counts.bot} del bot`} tone="bot" />
        <Badge label={`${counts.admin} manuales`} tone="admin" />
      </div>

      {error && (
        <div style={{ border: "1px solid #E2B8AA", background: "#FFF6F2", color: "#8F3E23", borderRadius: 12, padding: "12px 14px", fontSize: 14, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <div style={styles.panel}>
        {showForm && (
          <div style={styles.form}>
            <Field label="Nombre y apellido">
              <input style={styles.input} value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="Ej. Carlos Gómez" />
            </Field>
            <Field label="Teléfono">
              <input style={styles.input} value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} placeholder="Ej. 2314 555555" />
            </Field>
            <Field label="Email">
              <input style={styles.input} value={form.email} onChange={(event) => updateForm("email", event.target.value)} placeholder="opcional" />
            </Field>
            <Field label="Notas">
              <input style={styles.input} value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} placeholder="opcional" />
            </Field>
            <button type="button" style={styles.button} disabled={saving || form.name.trim().length < 2} onClick={createCustomer}>
              <Save size={16} />
              Guardar
            </button>
          </div>
        )}

        {customers.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "#928B7E", fontSize: 14 }}>
            Todavía no hay clientes. Cuando el bot cree reservas, van a aparecer acá.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Cliente</th>
                  <th style={styles.th}>Contacto</th>
                  <th style={styles.th}>Origen</th>
                  <th style={styles.th}>Notas</th>
                  <th style={styles.th}>Alta</th>
                  <th style={styles.th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => {
                  const editing = editingId === customer.id;
                  return (
                    <tr key={customer.id}>
                      <td style={styles.td}>
                        {editing ? (
                          <input style={styles.input} value={editingForm.name} onChange={(event) => updateEditingForm("name", event.target.value)} />
                        ) : (
                          <strong>{customer.name}</strong>
                        )}
                      </td>
                      <td style={styles.td}>
                        {editing ? (
                          <div style={{ display: "grid", gap: 8, minWidth: 220 }}>
                            <input style={styles.input} value={editingForm.phone} onChange={(event) => updateEditingForm("phone", event.target.value)} placeholder="Teléfono" />
                            <input style={styles.input} value={editingForm.email} onChange={(event) => updateEditingForm("email", event.target.value)} placeholder="Email" />
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: 4, color: "#6B6660" }}>
                            <span>{customer.phone || "Sin teléfono"}</span>
                            {customer.email && <span>{customer.email}</span>}
                          </div>
                        )}
                      </td>
                      <td style={styles.td}>
                        <Badge label={customer.source === "bot" ? `Bot${customer.channel ? ` · ${customer.channel}` : ""}` : "Agregado por admin"} tone={customer.source} />
                      </td>
                      <td style={styles.td}>
                        {editing ? (
                          <input style={styles.input} value={editingForm.notes} onChange={(event) => updateEditingForm("notes", event.target.value)} placeholder="Notas" />
                        ) : (
                          <span style={{ color: customer.notes ? "#6B6660" : "#A39C8F" }}>{customer.notes || "Sin notas"}</span>
                        )}
                      </td>
                      <td style={styles.td}>{formatDate(customer.createdAt)}</td>
                      <td style={styles.td}>
                        {customer.editable ? (
                          editing ? (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button type="button" style={styles.button} disabled={saving || editingForm.name.trim().length < 2} onClick={() => saveCustomer(customer.id)}>
                                <Save size={15} />
                                Guardar
                              </button>
                              <button type="button" style={styles.ghostButton} onClick={() => setEditingId(null)}>
                                <X size={15} />
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button type="button" style={styles.ghostButton} onClick={() => { setEditingId(customer.id); setEditingForm(toForm(customer)); }}>
                                <Edit3 size={15} />
                                Editar
                              </button>
                              <button type="button" style={styles.dangerButton} disabled={saving} onClick={() => deleteCustomer(customer.id)}>
                                <Trash2 size={15} />
                                Borrar
                              </button>
                            </div>
                          )
                        ) : (
                          <span style={{ fontSize: 13, color: "#928B7E", fontWeight: 600 }}>Solo lectura</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      {children}
    </label>
  );
}

function Badge({ label, tone }: { label: string; tone?: "bot" | "admin" }) {
  const color =
    tone === "bot" ? { background: "#EAF1F8", color: "#315E82", border: "#D4E3EF" } :
    tone === "admin" ? { background: "#F3EFE7", color: "#6B5A3B", border: "#E4D9C7" } :
    { background: "#fff", color: "#6B6660", border: "#E7E1D6" };
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      border: `1px solid ${color.border}`,
      background: color.background,
      color: color.color,
      borderRadius: 999,
      padding: "5px 9px",
      fontSize: 12,
      fontWeight: 800,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}
