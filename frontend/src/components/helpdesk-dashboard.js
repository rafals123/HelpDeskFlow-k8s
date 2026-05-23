"use client";

import { useEffect, useEffectEvent, useState, useTransition } from "react";
import styles from "./helpdesk-dashboard.module.css";
import { API_BASE, apiRequest } from "@/lib/api";

const PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUS_OPTIONS = ["NEW", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED"];

function summarizeCase(caseRecord) {
  return {
    id: caseRecord.id,
    caseNumber: caseRecord.caseNumber,
    title: caseRecord.title,
    description: caseRecord.description,
    status: caseRecord.status,
    priority: caseRecord.priority,
    createdAt: caseRecord.createdAt,
    updatedAt: caseRecord.updatedAt,
    commentsCount: caseRecord.comments?.length ?? caseRecord.commentsCount ?? 0,
    reportedBy: caseRecord.reportedBy,
    supportRep: caseRecord.supportRep,
  };
}

export default function HelpdeskDashboard() {
  const [token, setToken] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [supportReps, setSupportReps] = useState([]);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    fullName: "",
    email: "",
    password: "",
  });
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    priority: "MEDIUM",
  });
  const [commentText, setCommentText] = useState("");
  const [supportRepId, setSupportRepId] = useState("");
  const [statusValue, setStatusValue] = useState("NEW");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const restoreSavedSession = useEffectEvent((savedToken) => {
    hydrateSession(savedToken);
  });

  useEffect(() => {
    const savedToken = window.localStorage.getItem("helpdeskflow.token");

    if (!savedToken) {
      return;
    }

    setToken(savedToken);
    restoreSavedSession(savedToken);
  }, []);

  useEffect(() => {
    if (!selectedCase || !token) {
      return;
    }

    setSupportRepId(selectedCase.supportRep?.id ? String(selectedCase.supportRep.id) : "");
    setStatusValue(selectedCase.status);
  }, [selectedCase, token]);

  useEffect(() => {
    if (!selectedCaseId || !token) {
      setSelectedCase(null);
      return;
    }

    loadCaseDetails(selectedCaseId, token);
  }, [selectedCaseId, token]);

  async function hydrateSession(activeToken) {
    try {
      setIsLoading(true);
      setError("");

      const me = await apiRequest("/users/me", { token: activeToken });
      const [caseList, reps] = await Promise.all([
        apiRequest("/cases", { token: activeToken }),
        apiRequest("/users/support-reps", { token: activeToken }),
      ]);

      startTransition(() => {
        setCurrentUser(me);
        setCases(caseList);
        setSupportReps(reps);
        setSelectedCaseId((currentId) => {
          if (currentId && caseList.some((item) => item.id === currentId)) {
            return currentId;
          }

          return caseList[0]?.id ?? null;
        });
      });

      window.localStorage.setItem("helpdeskflow.token", activeToken);
      window.localStorage.setItem("helpdeskflow.user", JSON.stringify(me));
    } catch (requestError) {
      clearSession();
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadCaseDetails(caseId, activeToken) {
    try {
      setDetailLoading(true);
      setError("");
      const caseRecord = await apiRequest(`/cases/${caseId}`, {
        token: activeToken,
      });
      startTransition(() => {
        setSelectedCase(caseRecord);
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDetailLoading(false);
    }
  }

  function clearSession() {
    setToken("");
    setCurrentUser(null);
    setCases([]);
    setSelectedCaseId(null);
    setSelectedCase(null);
    setSupportReps([]);
    window.localStorage.removeItem("helpdeskflow.token");
    window.localStorage.removeItem("helpdeskflow.user");
  }

  function applyCaseUpdate(caseRecord, selectCase = true) {
    const summary = summarizeCase(caseRecord);

    startTransition(() => {
      setCases((currentCases) => {
        const rest = currentCases.filter((item) => item.id !== summary.id);
        return [summary, ...rest];
      });

      if (selectCase) {
        setSelectedCaseId(summary.id);
        setSelectedCase(caseRecord);
      }
    });
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();

    const path = authMode === "login" ? "/auth/login" : "/auth/register";
    const payload =
      authMode === "login"
        ? {
            email: authForm.email,
            password: authForm.password,
          }
        : authForm;

    try {
      setIsLoading(true);
      setError("");
      setMessage("");

      const result = await apiRequest(path, {
        method: "POST",
        body: payload,
      });

      setToken(result.token);
      setCurrentUser(result.user);
      window.localStorage.setItem("helpdeskflow.token", result.token);
      window.localStorage.setItem("helpdeskflow.user", JSON.stringify(result.user));

      setAuthForm({
        fullName: "",
        email: "",
        password: "",
      });

      setMessage(authMode === "login" ? "Logged in." : "Account created.");
      await hydrateSession(result.token);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateCase(event) {
    event.preventDefault();

    try {
      setIsLoading(true);
      setError("");
      setMessage("");

      const caseRecord = await apiRequest("/cases", {
        method: "POST",
        token,
        body: createForm,
      });

      applyCaseUpdate(caseRecord);
      setCreateForm({
        title: "",
        description: "",
        priority: "MEDIUM",
      });
      setMessage("New case created.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAddComment(event) {
    event.preventDefault();

    if (!selectedCaseId) {
      return;
    }

    try {
      setIsLoading(true);
      setError("");
      const caseRecord = await apiRequest(`/cases/${selectedCaseId}/comments`, {
        method: "POST",
        token,
        body: { content: commentText },
      });
      applyCaseUpdate(caseRecord);
      setCommentText("");
      setMessage("Comment added.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAssignSupportRep(event) {
    event.preventDefault();

    if (!selectedCaseId) {
      return;
    }

    try {
      setIsLoading(true);
      setError("");
      const caseRecord = await apiRequest(`/cases/${selectedCaseId}/assign`, {
        method: "PATCH",
        token,
        body: {
          supportRepId: supportRepId ? Number(supportRepId) : null,
        },
      });
      applyCaseUpdate(caseRecord);
      setMessage("Support rep updated.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStatusChange(event) {
    event.preventDefault();

    if (!selectedCaseId) {
      return;
    }

    try {
      setIsLoading(true);
      setError("");
      const caseRecord = await apiRequest(`/cases/${selectedCaseId}/status`, {
        method: "PATCH",
        token,
        body: {
          status: statusValue,
        },
      });
      applyCaseUpdate(caseRecord);
      setMessage("Status updated.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleLogout() {
    clearSession();
    setMessage("Logged out.");
    setError("");
  }

  const isAuthenticated = Boolean(token && currentUser);
  const canManageCase =
    currentUser && (currentUser.role === "SUPPORT_REP" || currentUser.role === "ADMIN");

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>HelpDeskFlow</p>
          <h1>Microservice help desk for IT case handling.</h1>
          <p className={styles.lead}>
            Frontend in Next.js, backend in Express, PostgreSQL on Docker and case flow
            with comments, history and support rep assignment.
          </p>
        </div>
        <div className={styles.heroMeta}>
          <div>
            <span>Gateway</span>
            <strong>{API_BASE}</strong>
          </div>
          <div>
            <span>Seed support</span>
            <strong>support@helpdeskflow.local / Support123!</strong>
          </div>
          <div>
            <span>Seed admin</span>
            <strong>admin@helpdeskflow.local / Admin123!</strong>
          </div>
        </div>
      </section>

      {(message || error) && (
        <section className={styles.feedbackRow}>
          {message ? <div className={styles.message}>{message}</div> : null}
          {error ? <div className={styles.error}>{error}</div> : null}
        </section>
      )}

      <section className={styles.grid}>
        <aside className={styles.sidebar}>
          <article className={styles.panel}>
            <div className={styles.panelHeading}>
              <h2>{isAuthenticated ? "Current session" : "Authentication"}</h2>
              <span>{isLoading || isPending ? "Working..." : "Ready"}</span>
            </div>

            {!isAuthenticated ? (
              <>
                <div className={styles.toggleRow}>
                  <button
                    type="button"
                    className={authMode === "login" ? styles.activeToggle : styles.toggle}
                    onClick={() => setAuthMode("login")}
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    className={authMode === "register" ? styles.activeToggle : styles.toggle}
                    onClick={() => setAuthMode("register")}
                  >
                    Register
                  </button>
                </div>

                <form className={styles.form} onSubmit={handleAuthSubmit}>
                  {authMode === "register" ? (
                    <label>
                      Full name
                      <input
                        value={authForm.fullName}
                        onChange={(event) =>
                          setAuthForm((current) => ({
                            ...current,
                            fullName: event.target.value,
                          }))
                        }
                        placeholder="Jan Kowalski"
                      />
                    </label>
                  ) : null}

                  <label>
                    Email
                    <input
                      type="email"
                      value={authForm.email}
                      onChange={(event) =>
                        setAuthForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      placeholder="user@example.com"
                    />
                  </label>

                  <label>
                    Password
                    <input
                      type="password"
                      value={authForm.password}
                      onChange={(event) =>
                        setAuthForm((current) => ({
                          ...current,
                          password: event.target.value,
                        }))
                      }
                      placeholder="Minimum 8 characters"
                    />
                  </label>

                  <button type="submit" className={styles.primaryButton} disabled={isLoading}>
                    {authMode === "login" ? "Sign in" : "Create account"}
                  </button>
                </form>
              </>
            ) : (
              <div className={styles.sessionCard}>
                <div>
                  <span>Signed in as</span>
                  <strong>{currentUser.fullName}</strong>
                  <p>{currentUser.email}</p>
                </div>
                <div className={styles.roleBadge}>{currentUser.role}</div>
                <button type="button" className={styles.secondaryButton} onClick={handleLogout}>
                  Log out
                </button>
              </div>
            )}
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeading}>
              <h2>Create case</h2>
              <span>reported_by: current user</span>
            </div>

            <form className={styles.form} onSubmit={handleCreateCase}>
              <label>
                Title
                <input
                  value={createForm.title}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Cannot connect to VPN"
                  disabled={!isAuthenticated}
                />
              </label>

              <label>
                Description
                <textarea
                  value={createForm.description}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Describe the problem and impact."
                  disabled={!isAuthenticated}
                />
              </label>

              <label>
                Priority
                <select
                  value={createForm.priority}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      priority: event.target.value,
                    }))
                  }
                  disabled={!isAuthenticated}
                >
                  {PRIORITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                className={styles.primaryButton}
                disabled={!isAuthenticated || isLoading}
              >
                Submit case
              </button>
            </form>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeading}>
              <h2>Cases</h2>
              <span>{cases.length} total</span>
            </div>

            <div className={styles.caseList}>
              {cases.length === 0 ? (
                <div className={styles.emptyState}>Login and create the first case.</div>
              ) : (
                cases.map((caseItem) => (
                  <button
                    type="button"
                    key={caseItem.id}
                    onClick={() => setSelectedCaseId(caseItem.id)}
                    className={
                      selectedCaseId === caseItem.id ? styles.caseItemActive : styles.caseItem
                    }
                  >
                    <div>
                      <strong>{caseItem.caseNumber}</strong>
                      <p>{caseItem.title}</p>
                    </div>
                    <div className={styles.caseMeta}>
                      <span>{caseItem.status}</span>
                      <small>{caseItem.priority}</small>
                    </div>
                  </button>
                ))
              )}
            </div>
          </article>
        </aside>

        <section className={styles.mainPanel}>
          <article className={styles.panel}>
            <div className={styles.panelHeading}>
              <h2>Case details</h2>
              <span>{detailLoading ? "Loading details..." : "Live view"}</span>
            </div>

            {!selectedCase ? (
              <div className={styles.emptyDetail}>
                Select a case to see comments, assignment and status history.
              </div>
            ) : (
              <div className={styles.detailBody}>
                <header className={styles.detailHeader}>
                  <div>
                    <p className={styles.caseLabel}>{selectedCase.caseNumber}</p>
                    <h3>{selectedCase.title}</h3>
                    <p>{selectedCase.description}</p>
                  </div>
                  <div className={styles.tagGroup}>
                    <span className={styles.statusTag}>{selectedCase.status}</span>
                    <span className={styles.priorityTag}>{selectedCase.priority}</span>
                  </div>
                </header>

                <div className={styles.infoGrid}>
                  <div>
                    <span>Reported by</span>
                    <strong>{selectedCase.reportedBy.fullName}</strong>
                    <p>{selectedCase.reportedBy.email}</p>
                  </div>
                  <div>
                    <span>Support rep</span>
                    <strong>{selectedCase.supportRep?.fullName || "Unassigned"}</strong>
                    <p>{selectedCase.supportRep?.email || "Choose below"}</p>
                  </div>
                  <div>
                    <span>Created</span>
                    <strong>{new Date(selectedCase.createdAt).toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Updated</span>
                    <strong>{new Date(selectedCase.updatedAt).toLocaleString()}</strong>
                  </div>
                </div>

                {canManageCase ? (
                  <div className={styles.actionsGrid}>
                    <form className={styles.formInline} onSubmit={handleAssignSupportRep}>
                      <label>
                        Support rep
                        <select
                          value={supportRepId}
                          onChange={(event) => setSupportRepId(event.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {supportReps.map((supportRep) => (
                            <option key={supportRep.id} value={supportRep.id}>
                              {supportRep.fullName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit" className={styles.secondaryButton}>
                        Save assignment
                      </button>
                    </form>

                    <form className={styles.formInline} onSubmit={handleStatusChange}>
                      <label>
                        Status
                        <select
                          value={statusValue}
                          onChange={(event) => setStatusValue(event.target.value)}
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit" className={styles.secondaryButton}>
                        Save status
                      </button>
                    </form>
                  </div>
                ) : null}

                <div className={styles.columns}>
                  <section className={styles.subPanel}>
                    <div className={styles.subPanelHeading}>
                      <h4>Comments</h4>
                      <span>{selectedCase.comments.length}</span>
                    </div>

                    <div className={styles.timeline}>
                      {selectedCase.comments.length === 0 ? (
                        <div className={styles.emptyState}>No comments yet.</div>
                      ) : (
                        selectedCase.comments.map((comment) => (
                          <article key={comment.id} className={styles.timelineItem}>
                            <div>
                              <strong>{comment.author.fullName}</strong>
                              <span>{comment.author.role}</span>
                            </div>
                            <p>{comment.content}</p>
                            <small>{new Date(comment.createdAt).toLocaleString()}</small>
                          </article>
                        ))
                      )}
                    </div>

                    <form className={styles.form} onSubmit={handleAddComment}>
                      <label>
                        New comment
                        <textarea
                          value={commentText}
                          onChange={(event) => setCommentText(event.target.value)}
                          placeholder="Add new information to the case."
                          disabled={!isAuthenticated}
                        />
                      </label>
                      <button
                        type="submit"
                        className={styles.primaryButton}
                        disabled={!isAuthenticated || isLoading}
                      >
                        Add comment
                      </button>
                    </form>
                  </section>

                  <section className={styles.subPanel}>
                    <div className={styles.subPanelHeading}>
                      <h4>History</h4>
                      <span>{selectedCase.history.length}</span>
                    </div>

                    <div className={styles.timeline}>
                      {selectedCase.history.map((entry) => (
                        <article key={entry.id} className={styles.timelineItem}>
                          <div>
                            <strong>{entry.action}</strong>
                            <span>{entry.changedBy.fullName}</span>
                          </div>
                          <p>
                            {entry.oldValue ? `${entry.oldValue} -> ` : ""}
                            {entry.newValue || "No additional data"}
                          </p>
                          <small>{new Date(entry.createdAt).toLocaleString()}</small>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            )}
          </article>
        </section>
      </section>
    </main>
  );
}
